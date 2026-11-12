IMAGE ?= webwriter
TAG ?= latest

# Origins are baked into the build (editor frames must run on a separate origin from the app).
# Leave empty for local testing: the app then pairs 127.0.0.1 <-> localhost automatically.
APP_ORIGIN ?=
EDITOR_ORIGIN ?=

# Local container settings
PORT ?= 8080
# Set BASIC_USER and BASIC_PASS in your shell (or .env) to enable basic auth in the container

.DEFAULT_GOAL := help
.PHONY: help install dev build preview test sync docker-build docker-run docker-serve docker-stop clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (bun)
	bun install

dev: ## Run the DOM editor dev server
	npm run --workspace @webwriter/domeditor start

build: ## Build the DOM editor for production
	npm run --workspace @webwriter/domeditor build

preview: ## Serve the DOM editor build locally
	npm run --workspace @webwriter/domeditor preview

test: ## Run the DOM editor test suite once
	npm run --workspace @webwriter/domeditor vitest -- run

sync: ## Run the local y-websocket sync server on :1234
	HOST=localhost PORT=1234 npm exec --offline --workspace @webwriter/domeditor -- y-websocket-server

docker-build: ## Build the production Docker image (caddy + static files)
	docker build \
		--build-arg VITE_APP_ORIGIN=$(APP_ORIGIN) \
		--build-arg VITE_EDITOR_ORIGIN=$(EDITOR_ORIGIN) \
		-t $(IMAGE):$(TAG) .

docker-run: ## Run the image locally (set BASIC_USER/BASIC_PASS for basic auth)
	docker run --rm -it --name $(IMAGE) \
		-p $(PORT):80 \
		-e BASIC_USER -e BASIC_PASS \
		-e EDITOR_ORIGIN=$(EDITOR_ORIGIN) \
		$(IMAGE):$(TAG)

docker-serve: docker-build docker-run ## Build the image and run it

docker-stop: ## Stop a locally running container
	docker rm -f $(IMAGE) 2>/dev/null || true

clean: ## Remove build outputs (keeps node_modules)
	rm -rf @webwriter/*/dist
