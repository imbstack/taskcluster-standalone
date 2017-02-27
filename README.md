Taskcluster Standlone
=====================

This contains both the [Helm](https://github.com/kubernetes/helm) charts and [Packer](https://www.packer.io/)
configs that can be used to deploy a taskcluster installation onto Kubernetes. This is very much a work
in progress, and is only being tried out on [Minikube](https://github.com/kubernetes/minikube) for the
time being.

Install
-------

First set up a Minikube cluster and install Helm.

To install onto a Kubernetes cluster, first copy `config-example.yaml` to `config.yaml` and then run
`helm install -f config.yaml .`. To make changes once it has been installed, you can
`helm update -f config.yaml <release name> .` where `release name` is the name of the release that was
created when you installed.


Building Images
---------------

First install Packer and then from the packer directory,
`packer build -var service=<github project name> ./templates/node.json`. Where the github project is
in the taskcluster org. This currently only works with node services that use npm and run under node 7.
An image will be pushed to [imbstack's docker hub](https://hub.docker.com/u/imbstack/) and will immediately
be available for use in the Helm configuration.


TODO
----

Following is a non-exhaustive list of things I can think of that need to happen before this can work:

- [ ] Services that run inside this must have instances of hardcoded urls (i.e. taskcluster.net) removed
- [ ] taskcluster-client should be made to more easily work with Kubernetes routing
- [ ] All dependencies on Pulse should be removed and replaced with taskcluster-pulse
