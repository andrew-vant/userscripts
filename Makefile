.PHONY: lint

lint:
	node --check *.js
	perl -ne 'if (length($$_) > 79) { exit 1 }' *.md Makefile
