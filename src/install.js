/*
 *  Given the following from bootstrap.yaml:
 *  1. AWS Creds
 *  2. Azure (classic?) storage account creds
 *  3. Optional sentry/statsum creds
 *  4. artifact/docs/references bucket names
 *
 *  Do the following:
 *  0. setup a statsum instance since auth relies on it existing first
 *  1. (optional) create buckets for references and docs (these should be configured to be static websites)
 *  2. create buckets for public/private artifacts and raw docs (for lib-docs)
 *  3. create an iam user for auth to use that can manage the artifacts buckets
 *  4. Give iam user creds + azure creds to auth secrets in config.yaml
 *  5. Generate crypto keys for encrypting tables, etc
 *  6. At this point, run helm to install only the auth service: `helm install -f config.yaml charts/auth`
 *  7. <now figure out steps for setting up queue service>
 *  8. <I figure there will be fewer steps for most services>
 */
const AWS = require('aws-sdk');
const azure = require('ms-rest-azure');
const storage = require('azure-arm-storage');
const resource = require('azure-arm-resource');
const config = require('typed-env-config');
const Promise = require('bluebird');
const _ = require('lodash');
const yaml = require('js-yaml');
const fs = require('fs');
const crypto = require('crypto');
const spawn = require('child_process').spawn;

const genFile = './generated-config.yml';

async function setupAuthAWS(cfg, gen, s3, iam) {
  gen.auth = gen.auth || {};
  gen.auth.secrets = gen.auth.secrets || {};
  await Promise.map(_.values(cfg.aws.buckets), Bucket => s3.createBucket({
    Bucket,
  }).promise());
  if (gen.auth.secrets.AWS_ACCESS_KEY_ID && gen.auth.secrets.AWS_SECRET_ACCESS_KEY) {
    console.log('Auth AWS creds already defined. Continuing...');
  } else {
    let user = await iam.createUser({
      UserName: 'taskcluster-auth',
    }).promise();
    // TODO: Make this user able to manage the s3 buckets we just created.
    let keys = await iam.createAccessKey({
      UserName: 'taskcluster-auth',
    }).promise();
    gen.auth.secrets.AWS_ACCESS_KEY_ID = keys.AccessKey.AccessKeyId;
    gen.auth.secrets.AWS_SECRET_ACCESS_KEY = keys.AccessKey.SecretAccessKey;
  }
}

function setupSentry(cfg, gen) {
  gen.auth.secrets.SENTRY_API_KEY = cfg.sentry.apiToken;
}

// TODO: Once we switch to taskcluster-pulse we won't need
// this function at all.
function temporarySetupPulse(cfg, gen) {
  gen.auth.secrets.PULSE_USERNAME = cfg.pulse.username;
  gen.auth.secrets.PULSE_PASSWORD = cfg.pulse.password;
}

function setupStatsum(cfg, gen) {
  if (gen.auth.secrets.STATSUM_API_SECRET && gen.auth.secrets.STATSUM_BASE_URL) {
    console.log('Statsum already set up. Continuing...');
  } else {
    // TODO: Here we should helm install the statsum image jonasfj/statsum:v7
    // We only want one node of this. It needs JWT_SECRET_KEY, SENTRY_DSN,
    // and SIGNALFX_TOKEN
    //
    // Then, these both will be grabbed from the started instance.
    gen.auth.secrets.STATSUM_API_SECRET = 'TBD';
    gen.auth.secrets.STATSUM_BASE_URL = 'TBD';
  }
}

async function setupAzure(cfg, gen) {
  if (gen.auth.secrets.TABLE_SIGNING_KEY && gen.auth.secrets.TABLE_CRYPTO_KEY) {
    console.log('Table crypto already set up. Continuing...');
  } else {
    gen.auth.secrets.TABLE_SIGNING_KEY = crypto.randomBytes(48).toString('base64');
    gen.auth.secrets.TABLE_CRYPTO_KEY = crypto.randomBytes(32).toString('base64');
  }

  if (!gen.auth.secrets.ROOT_ACCESS_TOKEN) {
    gen.auth.secrets.ROOT_ACCESS_TOKEN = crypto.randomBytes(48).toString('base64')
                                                               .replace(/\//g,'_')
                                                               .replace(/\+/g,'-');
  }

  gen.auth.secrets.AZURE_ACCOUNTS = gen.auth.secrets.AZURE_ACCOUNTS || '{}';

  if (gen.auth.secrets.AZURE_ACCOUNT_NAME && gen.auth.secrets.AZURE_ACCOUNT_KEY) {
    console.log('Azure account already configured. Continuing...');
  } else {
    console.log('Beginning azure setup...');
    await new Promise((accept, reject) => {
      azure.interactiveLogin({domain: cfg.azure.tenantId}, (err, credentials) => {
        if (err) {
          return reject(err);
        }
        const resourceClient = new resource.ResourceManagementClient(credentials, cfg.azure.subscriptionId);
        const resourceGroup = 'taskcluster';
        var resourceParams = {
          location: 'East US',
        };
        resourceClient.resourceGroups.createOrUpdate(resourceGroup, resourceParams, (err, result) => {
          if (err) {
            return reject(err);
          }
          resourceClient.providers.register('Microsoft.Storage', (err, result) => {
            if (err) {
              return reject(err);
            }
            const storageClient = new storage(credentials, cfg.azure.subscriptionId);
            var createParameters = {
              kind: 'Storage'
            };
            const accountParams = {
              location: 'East US', // TODO: Make this configurable
              sku: {
                name: 'Standard_LRS' // TODO: Figure out which one this should be
              },
              kind: 'Storage',
            };
            console.log('This could take a sec.');
            storageClient.storageAccounts.create(resourceGroup, cfg.azure.authStorageAccount, accountParams, (err, result) => {
              if (err) {
                return reject(err);
              }
              storageClient.storageAccounts.listKeys(resourceGroup, cfg.azure.authStorageAccount, (err, result) => {
                if (err) {
                  return reject(err);
                }
                gen.auth.secrets.AZURE_ACCOUNT_NAME = cfg.azure.authStorageAccount;
                gen.auth.secrets.AZURE_ACCOUNT_KEY = result.keys[0].value;
                accept();
              });
            });
          });
        });
      });
    });
  }
}

async function installAuth(cfg) {
  console.log('Installing auth service into Kubernetes');
  const helm = spawn('helm', ['install',
                              '--namespace', cfg.helm.namespace,
                              '--set', 'auth.install=true',
                              '-f', genFile,
                              '.']);
  helm.stdout.on('data', data => console.log(data.toString()));
  helm.stderr.on('data', data => console.error(data.toString()));
  await new Promise((accept, reject) => {
    helm.on('close', accept);
    helm.on('error', reject);
  });
}

async function main() {
  const cfg = config({});
  let gen = {};
  try {
    gen = yaml.safeLoad(fs.readFileSync(genFile, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
  const s3 = new AWS.S3({
    credentials: cfg.aws,
  });
  const iam = new AWS.IAM({});
  setupSentry(cfg, gen);
  temporarySetupPulse(cfg, gen);
  setupStatsum(cfg, gen);
  await setupAuthAWS(cfg, gen, s3, iam);
  await setupAzure(cfg, gen);
  fs.writeFileSync(genFile, yaml.safeDump(gen));
  await installAuth(cfg);
}

if (!module.parent) {
  main().catch(err => {
    console.log(err.stack || err);
    process.exit(1);
  });
}
