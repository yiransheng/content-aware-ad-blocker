(function() {
    var tabScripts = {};
    var tabUrls = {};
    var urlSummaries = {};
    var urlWhitelist = {};
    var currentActiveTab = null;

    var filters = {};
    const FILTER_URLS = {
        "easylist": "https://easylist.to/easylist/easylist.txt",
        "privacy": "https://easylist.to/easylist/easyprivacy.txt",
        "annoyance": "https://easylist.to/easylist/fanboy-annoyance.txt",
        "social": "https://easylist.to/easylist/fanboy-social.txt"
    };

    // Gradient from green -> gray -> red, since a positive number means the
    // script is to be rejected
    var CONTRIB_COLORS = [
        "9cf4b9", "b3edc6", "cae7d3", "e1e1e1", "e7c9ca", "edb2b5", "f49ca0"
    ];

    function debounce(func, wait, immediate) {
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    };

    function mergeSummaries(otherSummaries) {
        Object.keys(otherSummaries).forEach(key => {
            if (!urlSummaries[key]) {
                urlSummaries[key] = otherSummaries[key];
            }
        });
    }
    function mergeWhitelist(otherWhitelist) {
        Object.keys(otherWhitelist).forEach(key => {
            urlWhitelist[key] = true;
        });
    }

    chrome.storage.sync.get(["urlSummaries", "urlWhitelist"], (items) => {
        mergeSummaries(items.urlSummaries || {});
        mergeWhitelist(items.urlWhitelist || {});
        console.log("Loaded data:", items);
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (changes.urlSummaries) {
            mergeSummaries(changes.urlSummaries.newValue);
        }
        if (changes.urlWhitelist) {
            mergeWhitelist(changes.urlWhitelist.newValue);
        }
        console.log("Updated data:", changes);
    });

    function calcUpdateSummaries(tabId) {
        chrome.tabs.get(tabId, (tab) => {
            if (tab.url && tabUrls[tabId] !== tab.url) {
                tabUrls[tabId] = tab.url;
            }

            var blocked = tabScripts[tabId] || {};
            var summary = {
                totalBlocked: 0,
                shouldBeBlocked: {
                    total: 0,
                    urlBlocked: 0,
                    contentBlocked: 0,
                    blocked: 0,
                    filtered: 0,
                },
                shouldNotBeBlocked: {
                    total: 0,
                    urlBlocked: 0,
                    contentBlocked: 0,
                    filtered: 0,
                    whitelisted: 0,
                    blocked: 0,
                },
            }
            Object.keys(blocked).forEach(item => {
                // We should have blocked if either the url or content was
                // flagged by the model or the filter suggests the url should
                // have been blocked AND url was not in thewhitelist
                if ((blocked[item].urlBlocked === 1 ||
                     blocked[item].contentBlocked === 1 ||
                     blocked[item].urlFiltered === 1) &&
                     blocked[item].whitelist !== 1) {
                    summary.shouldBeBlocked.total += 1;
                    summary.shouldBeBlocked.urlBlocked += (
                        blocked[item].urlBlocked || 0);
                    summary.shouldBeBlocked.contentBlocked += (
                        blocked[item].contentBlocked || 0);
                    summary.shouldBeBlocked.filtered += (
                        blocked[item].urlFiltered || 0);
                    summary.shouldBeBlocked.blocked +=
                        blocked[item].blocked;
                } else {
                    summary.shouldNotBeBlocked.total += 1;
                    summary.shouldNotBeBlocked.urlBlocked += (
                        blocked[item].urlBlocked || 0);
                    summary.shouldNotBeBlocked.contentBlocked += (
                        blocked[item].contentBlocked || 0);
                    summary.shouldNotBeBlocked.filtered += (
                        blocked[item].urlFiltered || 0);
                    summary.shouldNotBeBlocked.whitelisted += (
                        blocked[item].whitelisted || 0);
                    summary.shouldNotBeBlocked.blocked +=
                        blocked[item].blocked;
                }
                summary.totalBlocked += blocked[item].blocked;
            });

            urlSummaries[tabUrls[tabId]] = summary;
            chrome.storage.sync.set({'urlSummaries': urlSummaries});

            console.log("Updated URL summaries for", tabUrls[tabId], urlSummaries[tabUrls[tabId]]);
        });
    }

    var _updateSummaries = {};
    function updateSummaries(tabId) {
        if (!_updateSummaries[tabId]) {
            _updateSummaries[tabId] = debounce(
                () => calcUpdateSummaries(tabId), 1000, false);
        }
        _updateSummaries[tabId]();
    }

    function updateBadge(tabId) {
        var blocked = tabScripts[tabId] || {};
        var numBlocked = Object.keys(blocked).filter(
            (item) => blocked[item].contentBlocked == 1 || blocked[item].urlBlocked == 1
        ).length;

        chrome.browserAction.setBadgeBackgroundColor({color: "#ba3500"});
        if (numBlocked > 0) {
            chrome.browserAction.setBadgeText(
                {text: "" + numBlocked, tabId: tabId});
        } else {
            chrome.browserAction.setBadgeText({text: "", tabId: tabId});
        }

        updateSummaries(tabId);
    }

    function parseFilter(name, filterData) {
        var parsedFilterData = {};
        ABPFilterParser.parse(filterData, parsedFilterData);
        filters[name] = parsedFilterData;
        console.log("Loaded filter list", name);
    }

    function loadFilterLists() {
        var filterNames = Object.keys(FILTER_URLS).map(name => "FILTER:" + name);
        chrome.storage.local.get(filterNames, filterData => {
            Object.keys(FILTER_URLS).forEach(name => {
                // TODO(tom): Update filters periodically
                if (filterData["FILTER:" + name]) {
                    console.log("Found filter list in cache", name);
                    parseFilter(name, filterData["FILTER:" + name]);
                } else {
                    console.log("Fetching filter list", name);
                    var request = new XMLHttpRequest();
                    request.onload = (response) => {
                        var filterText = response.target.responseText
                        var d = {};
                        d["FILTER:" + name] = filterText;
                        chrome.storage.local.set(d);
                        parseFilter(name, filterText);
                    }
                    request.open('GET', FILTER_URLS[name]);
                    request.send();
                }
            });
        });

    }

    function shouldBlockUrlUsingFilters(domain, url, prevInfo) {
        var startTime = performance.now();
        prevInfo.urlFiltered = 0;
        var filterNames = Object.keys(filters);
        for (var i = 0; i < filterNames.length; i++) {
            var name = filterNames[i];
            if (ABPFilterParser.matches(filters[name], url, {
                domain: domain,
                elementTypeMaskMap: ABPFilterParser.elementTypes.SCRIPT,
            })) {
                console.log("!! Url", url, "filtered by", name);
                prevInfo.urlFiltered = 1;
                prevInfo.urlFilteredBy = name;
                break;
            }
        }
        prevInfo.urlFilterTime = performance.now() - startTime;
        return prevInfo;
    }

    function tokenizeContents(contents) {
        contents = (contents
            .replace(/(\/\*(.|\n|\r)+?\*\/)|([^:]\/\/.+?$)/gm, "")
            .match(/[A-Z][a-z]+|[A-Z]+|[a-z]+|[0-9]+|[\-\\\/_{}\"\',\(\)\.:!\?]|[\+\*=]|\*.+\*\//g)
            || [])
            .map(x => x.toLowerCase());
        return contents;
    }

    function calcSVMScore(tokens, model, max_ngram) {
        // Build the SVM input vector
        var inputVector = Array(model.w.length).fill(0.0);

        // Check all n-grams for n=1..max_ngram
        for (var n = 1; n <= max_ngram; n++) {
            for (var p = 0; p < tokens.length + 1 - n; p++) {
                var subTokens = tokens.slice(p, p + n).join(" ");
                var index = model.vocab[subTokens];
                if (index !== undefined) {
                    inputVector[index] += model.idf[index];
                }
            }
        }

        // Normalize input vector
        var mag = Math.sqrt(inputVector.reduce((p, n) => p + n*n, 0))
        inputVector = inputVector.map(x => x / mag);

        return inputVector.reduce((p, n, i) => p + n * model.w[i], 0);
    }

    function shouldBlockUrl(url, prevInfo) {
        var startTime = performance.now();
        var urlModel = getUrlModel();

        var urlTokens = url.toLowerCase().split("");
        var urlScore = calcSVMScore(urlTokens, urlModel, 6);

        // SVM score
        var svmScore = urlModel.b + urlScore;

        prevInfo.urlBlocked = (svmScore > 0) ? 1 : 0;
        prevInfo.urlScore = svmScore;
        prevInfo.urlScoreTime = performance.now() - startTime;
        return prevInfo;
    }

    function convolution(str, windowSize, stride) {
        var len = str.length;
        if (len < windowSize) {
            return [str];
        }
        var outputs = [];
        for(var i=0; i+windowSize<len; i += stride) {
            outputs.push(str.slice(i, i+windowSize));
        }
        return outputs;
    }

    function average(numbers) {
      return numbers.reduce(function (a, b) {
        return a+b;
      }, 0) / numbers.length;
    }

    function shouldBlockContents(url, contents, prevInfo) {
        var startTime = performance.now();
        var combinedModel = getCombinedModel();

        var urlTokens = url.toLowerCase().split("");
        var urlScore = calcSVMScore(urlTokens, combinedModel.url, 6);


        // non-overlapping segments of 1024 chars long each, max 20 segments
        var scriptSegments = convolution(contents, 1024, 1024).slice(0, 20);
        var scriptTokens = scriptSegments.map(tokenizeContents);
        var scriptScores = scriptTokens.map(function(tokens) {
          return calcSVMScore(tokens, combinedModel.script, 2);
        });
        var scriptScore = average(scriptScores);

        var sizeTokens = [];
        for (var size = 1; size <= contents.length; size *= 2) {
            sizeTokens.push(size);
        }
        var sizeScore = calcSVMScore(sizeTokens, combinedModel.size, 1);

        // SVM score
        var svmScore = combinedModel.b + urlScore + scriptScore;

        prevInfo.contentBlocked = (svmScore > 0) ? 1 : 0;
        prevInfo.contentScore = svmScore;
        prevInfo.contentScoreTime = performance.now() - startTime;
        return prevInfo;
    }

    function safe_tags(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') ;
    }

    function scoreTokens(tokens, model, max_ngram, padding) {
        var contributions = Array(tokens.length).fill(0.0);

        // Check all n-grams for n=1..max_ngram
        for (var n = 1; n <= max_ngram; n++) {
            for (var p = 0; p < tokens.length + 1 - n; p++) {
                var subTokens = tokens.slice(p, p + n).join(" ");
                var index = model.vocab[subTokens];
                // Check that index is defined and it's not a function (because
                // this is Javascript and subTokens could be something like
                // "constructor". Ugh.)
                if (index !== undefined && typeof(index) === "number") {
                    for (var ti = 0; ti < n; ti++) {
                        contributions[p + ti] += (
                            model.idf[index] * model.w[index]);
                    }
                }
            }
        }

        // Normalize to range [-1,1]
        var maxAbs = contributions.reduce((p, n) => Math.max(p, Math.abs(n)), 0);
        contributions = contributions.map(n => n / maxAbs);

        // Generate colored spans for each token colored by contribution
        return tokens.map((token, idx) => {
                var contribution = contributions[idx];
                var colorIdx = Math.round(contribution * 3) + 3;
                return "<span style=\"" +
                    "padding-right: " + padding + "px;" +
                    "background-color: #" + CONTRIB_COLORS[colorIdx] +
                    "\">" + safe_tags(token) + "</span>";
            }).join("");
    }

    function markupScript(url) {
        var urlModel = getUrlModel();
        var combinedModel = getCombinedModel();

        var request = new XMLHttpRequest();
        request.open('GET', url, false);  // `false` makes the request synchronous
        request.send(null);

        if (request.status !== 200) {
            // TODO(tom): What to do here?
            return 'ERROR: Unable to fetch URL ' + url;
        }

        var urlTokens = url.toLowerCase().split("");
        var scoredUrl = scoreTokens(urlTokens, urlModel, 6, 0);
        var urlScore = Math.round((urlModel.b + calcSVMScore(urlTokens, urlModel, 6)) * 100) / 100;
        var urlColor = (urlScore <= 0) ? CONTRIB_COLORS[0] : CONTRIB_COLORS[6];

        var originalContent = request.responseText.slice(0, 4096);
        var contentTokens = tokenizeContents(originalContent);
        var scoredContent = scoreTokens(contentTokens, combinedModel.script, 2, 4);
        var contentScore = Math.round((
            combinedModel.b +
            calcSVMScore(urlTokens, combinedModel.url, 6) +
            calcSVMScore(contentTokens, combinedModel.script, 2)) * 100) / 100;
        var contentColor = (contentScore <= 0) ? CONTRIB_COLORS[0] : CONTRIB_COLORS[6];

        var html = "<html><body>" +
            "<div style=\"position: fixed; left: 10px; right: 50%; top: 0px; bottom: 10px; overflow-y: auto\">" +
            "<h2>Original URL</h2>" +
            "<code>" + url + "</code>" +
            "<h2>Original content</h2>" +
            "<code>" +
            safe_tags(originalContent) +
            "</code></div>" +
            "<div style=\"position: fixed; left: 50%; right: 10px; top: 0px; bottom: 10px; overflow-y: auto\">" +
            "<h2>Scored URL (<span style=\"background-color: #" + urlColor + "\">" + urlScore + "</span>)</h2>" +
            "<code>" + scoredUrl + "</code>" +
            "<h2>Scored content (<span style=\"background-color: #" + contentColor + "\">" + contentScore + "</span>)</h2>" +
            "<code style=\"overflow-wrap: break-word\">" +
            scoredContent +
            "</code></div>" +
        "</body></html>";

        return html;
    }

    chrome.webRequest.onBeforeRequest.addListener(function(details) {
        if (details.type !== "script" || details.method !== "GET") {
            return;
        }
        if (!tabUrls[details.tabId] || tabUrls[details.tabId].slice(0, 4) !== 'http') {
            return;
        }

        tabScripts[details.tabId] = tabScripts[details.tabId] || {};

        var result = {
            blocked: 0,
            whitelisted: 0,
        };

        // Get the tab URL's domain
        var link = document.createElement('a');
        link.setAttribute('href', tabUrls[details.tabId]);
        var domain = link.hostname;
        console.log("DOMAIN", domain);

        result = shouldBlockUrlUsingFilters(domain, details.url, result);
        if (result.urlFiltered === 1) {
            console.log("## URL FILTERED", details.url, details.urlFilteredBy);
            result.blocked = 1;
        }

        result = shouldBlockUrl(details.url, result);
        if (result.urlBlocked === 1) {
            console.log("## URL BLOCKED", details.url, result.urlScore);
            result.blocked = 1;
        } else {
            var request = new XMLHttpRequest();
            request.open('GET', details.url, false);  // `false` makes the request synchronous
            request.send(null);

            if (request.status !== 200) {
                // TODO(tom): What to do here?
                return;
            }

            result = shouldBlockContents(details.url, request.responseText, result);
            if (result.contentBlocked === 1) {
                console.log("## CONTENT BLOCKED", details.url, result.contentScore);
                result.blocked = 1;
            } else {
                console.log("Content passed", details.url, result.urlScore,
                    result.contentScore)
            }
        }

        if (result.blocked === 1 && urlWhitelist[details.url] === true) {
            console.log("## URL WHITELISTED", details.url);
            result.whitelisted = 1;
            result.blocked = 0;
        }

        tabScripts[details.tabId][details.url] = result;
        updateBadge(details.tabId);

        if (result.blocked === 1) {
            return {cancel: true};
        }
        return;

    }, {urls: ["http://*/*", "https://*/*"], types: ["script"]}, ["blocking"]);

    chrome.tabs.onActivated.addListener(function(details) {
        updateBadge(details.tabId);
        currentActiveTab = details.tabId;
    });

    chrome.tabs.onUpdated.addListener(function(tabId, details) {
        if (details.url && tabUrls[tabId] !== details.url) {
            tabScripts[tabId] = {};
            tabUrls[tabId] = details.url;
            updateBadge(tabId);
        }
    })

    console.log("Background script loaded!");
    loadFilterLists();

    chrome.runtime.onMessage.addListener(function (msg, sender, response) {
        if (msg.from === 'popup') {
            if (msg.action === 'markupScript') {
                response({
                    markup: markupScript(msg.url)
                });
            }
            if (msg.action === 'getScriptData') {
                var totalScriptsBlocked = 0;
                Object.keys(urlSummaries).forEach(key => {
                    totalScriptsBlocked += urlSummaries[key].totalBlocked;
                });
            }

            if (msg.action === 'updateWhitelist') {
                if (msg.add) {
                    urlWhitelist[msg.url] = true;
                    console.log("Added url to whitelist", msg.url);
                } else {
                    delete urlWhitelist[msg.url];
                    console.log("Removed url from whitelist", msg.url);
                }
                chrome.storage.sync.set({'urlWhitelist': urlWhitelist});
            }

            response({
                tabData: tabScripts[currentActiveTab] || {},
                globalData: {
                    totalScriptsBlocked: totalScriptsBlocked,
                    urlSummaries: urlSummaries,
                    urlWhitelist: urlWhitelist,
                }
            });
        }
    });
})();
