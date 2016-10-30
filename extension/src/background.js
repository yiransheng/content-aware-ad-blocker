(function() {
    var tabScripts = {};
    var tabUrls = {};

    function updateBadge(tabId) {
        var blocked = tabScripts[tabId] || {};
        var numBlocked = Object.keys(blocked).filter(function(item) { return blocked[item] == 1; }).length;
        chrome.browserAction.setBadgeBackgroundColor({color: "#ba3500"});
        if (numBlocked > 0) {
            chrome.browserAction.setBadgeText({text: "" + numBlocked});
        } else {
            chrome.browserAction.setBadgeText({text: ""});
        }
    }

    function shouldBlock(url, contents) {
        // TODO(tom): Insert model here!
        console.log("shouldBlock", url, contents.substr(0, 50));
        return {
            url: 0,
            content: 1
        };
    }

    chrome.webRequest.onBeforeRequest.addListener(function(details) {
        if (details.type !== "script" || details.method !== "GET") {
            return;
        }
        var request = new XMLHttpRequest();
        request.open('GET', details.url, false);  // `false` makes the request synchronous
        request.send(null);

        if (request.status !== 200) {
            return;
        }

        var result = shouldBlock(details.url, request.responseText);

        tabScripts[details.tabId] = tabScripts[details.tabId] || {};
        tabScripts[details.tabId][details.url] = result;

        updateBadge(details.tabId);
        if (result.content === 1) {
            return {cancel: true};
        }
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
})();
