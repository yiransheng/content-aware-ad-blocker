images:
	#pushd scraper && docker build -t scraper . && popd
	pushd labeler && docker build -t labeler . && popd
	pushd lang && docker build -t lang . && popd

scrape: images
	mkdir -p ./scripts
	docker-compose -f ./scraper/docker-compose.yml up

label: images
	docker run --rm -it -v `pwd`/scripts:/var/scripts labeler

parse: images
	docker run --rm -it \
		-v `pwd`/scripts:/var/scripts \
		-v `pwd`/scripts-ast:/var/scripts-ast \
		lang
