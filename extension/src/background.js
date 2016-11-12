(function() {
    var tabScripts = {};
    var tabUrls = {};
    var urlSummaries = {};
    var currentActiveTab = null;

    var filters = {};
    const FILTER_NAMES = ["easylist", "privacy", "annoyance", "social"];

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

    chrome.storage.sync.get(["urlSummaries"], (items) => {
        console.log("Loaded data:", items);
        mergeSummaries(items.urlSummaries || {});
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        console.log("Updated data:", changes);
        if (changes.urlSummaries) {
            mergeSummaries(changes.urlSummaries.newValue);
        }
    });

    var updateSummaries = debounce((tabId) => {
        chrome.tabs.get(tabId, (tab) => {
            if (tab.url && tabUrls[tabId] !== tab.url) {
                tabUrls[tabId] = tab.url;
            }

            var blocked = tabScripts[tabId] || {};
            var numBlocked = Object.keys(blocked).filter(
                (item) => blocked[item].contentBlocked == 1 || blocked[item].urlBlocked == 1
            ).length;

            var numOursBlocked = Object.keys(blocked).filter(
                (item) => (blocked[item].contentBlocked == 1 || blocked[item].urlBlocked == 1) && blocked[item].urlFiltered !== 1
            ).length;

            var numFilterBlocked = Object.keys(blocked).filter(
                (item) => (blocked[item].contentBlocked !== 1 && blocked[item].urlBlocked !== 1) && blocked[item].urlFiltered == 1
            ).length;

            urlSummaries[tabUrls[tabId]] = {
                totalBlocked: numBlocked,
                oursBlocked: numOursBlocked,
                filterBlocked: numFilterBlocked,
            }
            chrome.storage.sync.set({'urlSummaries': urlSummaries});

            console.log("Updated URL summaries for", tabUrls[tabId], urlSummaries[tabUrls[tabId]]);
        });
    }, 1000, false);

    function updateBadge(tabId) {
        var blocked = tabScripts[tabId] || {};
        var numBlocked = Object.keys(blocked).filter(
            (item) => blocked[item].contentBlocked == 1 || blocked[item].urlBlocked == 1
        ).length;

        chrome.browserAction.setBadgeBackgroundColor({color: "#ba3500"});
        if (numBlocked > 0) {
            chrome.browserAction.setBadgeText({text: "" + numBlocked});
        } else {
            chrome.browserAction.setBadgeText({text: ""});
        }

        updateSummaries(tabId);
    }

    function loadFilterList(name) {
        var request = new XMLHttpRequest();
        request.open('GET', chrome.extension.getURL('/filters/' + name + ".txt"), false);  // `false` makes the request synchronous
        request.send(null);

        var parsedFilterData = {};
        ABPFilterParser.parse(request.responseText, parsedFilterData);
        filters[name] = parsedFilterData;
        console.log("Loaded filter", name);
    }

    function shouldBlockUrlUsingFilters(url, prevInfo) {
        var startTime = performance.now();
        prevInfo.urlFiltered = 0;
        for (var i = 0; i < FILTER_NAMES.length; i++) {
            if (ABPFilterParser.matches(filters[FILTER_NAMES[i]], url, {
                domain: "",
                elementTypeMaskMap: ABPFilterParser.elementTypes.SCRIPT,
            })) {
                console.log("!! Url", url, "filtered by", FILTER_NAMES[i]);
                prevInfo.urlFiltered = 1;
                prevInfo.urlFilteredBy = FILTER_NAMES[i];
                break;
            }
        }
        prevInfo.urlFilterTime = performance.now() - startTime;
        return prevInfo;
    }

    function tokenizeContents(contents) {
        contents = contents
            .replace(/(\/\*[^*]+\*\/)/, "")
            .replace(/\/\/.+/, "")
            .match(/[A-Z][a-z]+|[A-Z]+|[a-z]+|[0-9]+|[\-\\\/_{}\"\',\(\)\.:]|[\+\*=]|\*.+\*\//g)
            .map((x) => (x.length === 1 && x >= "a" && x <= "z") ? "x" : x.toLowerCase());
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

    function shouldBlockContents(url, contents, prevInfo) {
        var startTime = performance.now();
        var combinedModel = getCombinedModel();

        var urlTokens = url.toLowerCase().split("");
        var urlScore = calcSVMScore(urlTokens, combinedModel.url, 6);

        var scriptTokens = tokenizeContents(contents.slice(0, 1024));
        var scriptScore = calcSVMScore(scriptTokens, combinedModel.script, 2);

        var sizeTokens = [];
        for (var size = 1; size <= contents.length; size *= 2) {
            sizeTokens.push(size);
        }
        var sizeScore = calcSVMScore(sizeTokens, combinedModel.size, 1);
        console.log("Size", sizeTokens, sizeScore);

        // SVM score
        var svmScore = combinedModel.b + urlScore + scriptScore;

        prevInfo.contentBlocked = (svmScore > 0) ? 1 : 0;
        prevInfo.contentScore = svmScore;
        prevInfo.contentScoreTime = performance.now() - startTime;
        return prevInfo;
    }

    chrome.webRequest.onBeforeRequest.addListener(function(details) {
        if (details.type !== "script" || details.method !== "GET") {
            return;
        }

        tabScripts[details.tabId] = tabScripts[details.tabId] || {};

        var result = {};

        result = shouldBlockUrlUsingFilters(details.url, result);

        result = shouldBlockUrl(details.url, result);
        if (result.urlBlocked === 1) {
            console.log("## URL BLOCKED", details.url, result.urlScore);
            tabScripts[details.tabId][details.url] = result;
            updateBadge(details.tabId);
            return {cancel: true};
        }

        var request = new XMLHttpRequest();
        request.open('GET', details.url, false);  // `false` makes the request synchronous
        request.send(null);

        if (request.status !== 200) {
            // TODO(tom): What to do here?
            return;
        }

        result = shouldBlockContents(details.url, request.responseText, result);
        tabScripts[details.tabId][details.url] = result;

        if (result.contentBlocked === 1) {
            console.log("## CONTENT BLOCKED", details.url, result.contentScore);
            updateBadge(details.tabId);
            return {cancel: true};
        }

        console.log("Content passed", details.url, result.urlScore, result.contentScore)
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
    FILTER_NAMES.map(loadFilterList);

    chrome.runtime.onMessage.addListener(function (msg, sender, response) {
        if ((msg.from === 'popup') && (msg.action === 'getScriptData')) {
            var totalScriptsBlocked = 0;
            Object.keys(urlSummaries).forEach(key => {
                totalScriptsBlocked += urlSummaries[key].totalBlocked;
            });

            response({
                tabData: tabScripts[currentActiveTab] || {},
                globalData: {
                    totalScriptsBlocked: totalScriptsBlocked,
                    urlSummaries: urlSummaries
                }
            });
        }
    });
})();
