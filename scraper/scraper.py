import hashlib
import json
import random
from urlparse import urlparse

import scrapy
from scrapy_splash import SplashRequest

seen_domains = set()

f_table = open("/var/scripts/table.jsonl", "aw")

# URLs crawled:
# wikipedia
# news.bbc.co.uk
# microsoft.com
# amazon.com
# http://www.cnn.com/
# https://www.yahoo.com/
# https://www.reddit.com/
# https://www.buzzfeed.com/
# http://www.nytimes.com/
class Spider(scrapy.Spider):
    name = 'spider'
    start_urls = ['http://www.nytimes.com/']

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

    def store_script(self, url, contents, inline):
        if type(contents) != unicode and type(contents) != str:
            print "UNKNOWN TYPE %s" % type(contents)
            return

        if type(contents) == unicode:
            contents = contents.encode("utf8")

        h = hashlib.sha1(contents)
        sha1 = h.hexdigest()
        print "SCRIPT %s SHA %s" % (url, sha1)

        with open("/var/scripts/%s.js" % sha1, "w") as f:
            f.write(contents)

        f_table.write("%s\n" % json.dumps({
            "url": url,
            "sha": sha1,
            "inline": inline,
        }))
        f_table.flush()

    def get_domain(self, url):
        parsed = urlparse(url)
        parsed = parsed.netloc.split(":")[0]
        return ".".join(parsed.split(".")[-2:])

    def parse(self, response):
        for script in response.xpath("//script"):
            contents = script.xpath("text()").extract_first()
            if contents:
                self.store_script(response.url, contents, True)
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

        # Pick up to 10 random links to follow that lead to new domains
        if len(new_urls) > 0:
            for url in random.sample(new_urls, min(len(new_urls), 10)):
                yield SplashRequest(url, self.parse, args={'wait': 0.5})

    def parse_script(self, response):
        yield self.store_script(response.url, response.body, False)
