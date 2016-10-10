SHELL=/bin/bash

images:
	pushd scraper && docker build -t scraper . && popd
	pushd labeler && docker build -t labeler . && popd
	pushd lang && docker build -t lang . && popd
	pushd models && docker build -t models . && popd

scrape: images
	mkdir -p ./scripts
	docker-compose -f ./scraper/docker-compose.yml up

label: images
	docker run --rm -it -v `pwd`/scripts:/var/scripts labeler

parse: images
	docker run --rm -it \
		-v `pwd`/scripts:/usr/src/app/scripts \
		-v `pwd`/scripts-ast:/usr/src/app/scripts-ast \
		lang

notebook: images
	docker run --rm -it \
		-v `pwd`:/usr/src/app \
		-p 9123:9123 \
		models
