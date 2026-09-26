SHELL = /bin/bash

.DEFAULT_GOAL = run

# ------------------------------------------------------------
# dev

.PHONY: setup
setup:
	yarn install --production=false

.PHONY: run
run: setup
	yarn start

.PHONY: test
test: setup
	yarn test

.PHONY: test-update-snapshots
test-update-snapshots: setup
	yarn test -u

