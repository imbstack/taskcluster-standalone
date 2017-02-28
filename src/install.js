// Given the following from bootstrap.yaml:
// 1. AWS Creds
// 2. Azure (classic?) storage account creds
// 3. Optional sentry/statsum creds
// 4. artifact/docs/references bucket names
//
// Do the following:
// 1. (optional) create buckets for references and docs (these should be configured to be static websites)
// 2. create buckets for public/private artifacts and raw docs (for lib-docs)
// 3. create an iam user for auth to use that can manage the artifacts buckets
// 4. Give iam user creds + azure creds to auth secrets in config.yaml
// 5. Generate crypto keys for encrypting tables, etc
// 6. At this point, run helm to install only the auth service: `helm install -f config.yaml charts/auth`
// 7. <now figure out steps for setting up queue service>
// 8. <I figure there will be fewer steps for most services>
