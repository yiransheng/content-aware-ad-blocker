(function() {
    var tabScripts = {};
    var tabUrls = {};

    var filters = {};
    const FILTER_NAMES = ["easylist", "easyprivacy", "fanboy-annoyance", "fanboy-social"];

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
        for (var i = 0; i < FILTER_NAMES.length; i++) {
            if (ABPFilterParser.matches(filters[FILTER_NAMES[i]], url, {
                domain: "",
                elementTypeMaskMap: ABPFilterParser.elementTypes.SCRIPT,
            })) {
                console.log("!! Url", url, "filtered by", FILTER_NAMES[i]);
                prevInfo.urlFiltered = 1;
                prevInfo.urlFilteredBy = FILTER_NAMES[i];
                return prevInfo;
            }
        }
        prevInfo.urlFiltered = 0;
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
        var urlModel = getUrlModel();

        var urlTokens = url.toLowerCase().split("");
        var urlScore = calcSVMScore(urlTokens, urlModel, 6);

        // SVM score
        var svmScore = urlModel.b + urlScore;

        prevInfo.urlBlocked = (svmScore > 0) ? 1 : 0;
        prevInfo.urlScore = svmScore;
        return prevInfo;
    }

    function shouldBlockContents(url, contents, prevInfo) {
        var combinedModel = getCombinedModel();

        var urlTokens = url.toLowerCase().split("");
        var urlScore = calcSVMScore(urlTokens, combinedModel.url, 6);

        var scriptTokens = tokenizeContents(contents);
        var scriptScore = calcSVMScore(scriptTokens, combinedModel.script, 2);

        // SVM score
        var svmScore = combinedModel.b + urlScore + scriptScore;

        prevInfo.contentBlocked = (svmScore > 0) ? 1 : 0;
        prevInfo.contentScore = svmScore;
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
})();
