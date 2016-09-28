import hashlib
import random
from urlparse import urlparse

import scrapy
from scrapy_splash import SplashRequest

seen_domains = set()

class Spider(scrapy.Spider):
    name = 'spider'
    start_urls = ['https://www.wikipedia.org/']

    custom_settings = {
        "SPLASH_URL": "http://splash:8050",

        "DOWNLOADER_MIDDLEWARES": {
            'scrapy_splash.SplashCookiesMiddleware': 723,
            'scrapy_splash.SplashMiddleware': 725,
            'scrapy.downloadermiddlewares.httpcompression.HttpCompressionMiddleware': 810,
        },

        "SPIDER_MIDDLEWARES": {
            'scrapy_splash.SplashDeduplicateArgsMiddleware': 100,
        },

        "DUPEFILTER_CLASS": 'scrapy_splash.SplashAwareDupeFilter',
    }

    def start_requests(self):
        for url in self.start_urls:
            yield SplashRequest(url, self.parse, args={'wait': 0.5})

    def store_script(self, url, contents):
        if type(contents) != unicode and type(contents) != str:
            print "UNKNOWN TYPE %s" % type(contents)
            return {}

        if type(contents) == unicode:
            contents = contents.encode("utf8")
            
        h = hashlib.sha1(contents)
        sha1 = h.hexdigest()
        print "SCRIPT %s SHA %s" % (url, sha1)

        with open("/var/scripts/%s.js" % sha1, "w") as f:
            f.write(contents)

        return {"url": url, "sha": sha1}

    def get_domain(self, url):
        parsed = urlparse(url)
        parsed = parsed.netloc.split(":")[0]
        return ".".join(parsed.split(".")[-2:])

    def parse(self, response):
        for script in response.xpath("//script"):
            contents = script.xpath("text()").extract_first()
            if contents:
                yield self.store_script(response.url, contents)
            else:
                script_url = script.xpath("@src").extract_first()
                if script_url:
                    url = response.urljoin(script_url)
                    #if url.startswith("//"):
                    #    url = "%s:%s" % (response.url.split(":")[0], url)
                    print "FETCHING SCRIPT %s" % url
                    yield scrapy.Request(url, self.parse_script)

        seen_urls = []
        new_urls = []
        for anchor in response.xpath("//a"):
            page_url = anchor.xpath("@href").extract_first()
            if page_url:
                url = response.urljoin(page_url)
                domain = self.get_domain(url)

                if domain not in seen_domains:
                    print "## NEW DOMAIN %s" % domain
                    new_urls.append(url)
                    seen_domains.add(domain)
                else:
                    seen_urls.append(url)

        # Pick up to 10 random links to follow, favoring new domains
        if len(new_urls) > 0:
            for url in random.sample(new_urls, min(len(new_urls), 10)):
                yield SplashRequest(url, self.parse, args={'wait': 0.5})

        """
        if len(new_urls) < 4 and len(seen_urls) > 0:
            for url in random.sample(seen_urls, min(len(seen_urls), 4 - len(new_urls))):
                yield SplashRequest(url, self.parse, args={'wait': 0.5})
        """

    def parse_script(self, response):
        yield self.store_script(response.url, response.body)
