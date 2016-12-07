const MAX_URL = 85;
const e = React.createElement;

function hash(str){
	var hash = 0;
	if (str.length == 0) return hash;
	for (i = 0; i < str.length; i++) {
		char = str.charCodeAt(i);
		hash = ((hash<<5)-hash)+char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash;
}

function updateUrlWhitelist(checked, url) {
    chrome.runtime.sendMessage({
        from: "popup",
        action: "updateUrlWhitelist",
        url: url,
        add: checked,
    }, function(data) {
        ReactDOM.render(
            e(PopupContents, data, null),
            document.getElementById('content'));
    });
}

function updateDomainWhitelist(checked, domain) {
    console.log("Send updateDomainWhitelist");
    chrome.runtime.sendMessage({
        from: "popup",
        action: "updateDomainWhitelist",
        domain: domain,
        add: checked,
    }, function(data) {
        ReactDOM.render(
            e(PopupContents, data, null),
            document.getElementById('content'));
    });
}

function viewScript(url) {
    console.log("viewScript", url);
    chrome.runtime.sendMessage({
        from: "popup",
        action: "markupScript",
        url: url,
    }, function(data) {
        // Load javascript source into a file
        var file = new Blob([data.markup], {type: "text/html"});

        // Create an anchor tag and click on it to open in a new tab
        var el = document.createElement('a');
        el.setAttribute("href", URL.createObjectURL(file));
        el.setAttribute("target", "_blank");
        el.click();
    });
}

function renderTable(data, whitelist) {
    var urlFilterTimeTotal = 0;
    var urlScoreTimeTotal = 0;
    var contentScoreTimeTotal = 0;
    var timeTotal = 0;

    var rows = [e('tr', {key: "header"}, [
        e('th', {key: "URL1"}, "URL"),
        e('th', {key: "Filter"}, "Filter"),
        e('th', {key: "URL2"}, "URL"),
        e('th', {key: "Content"}, "Content"),
        e('th', {key: "Time"}, "Time"),
        e('th', {key: "Unblock"}, "Unblock"),
    ])];

    rows = rows.concat(Object.keys(data).map(url => {
        var id = hash(url);
        var urlData = data[url];

        var totalTime = ((urlData.urlFilterTime || 0) +
            (urlData.urlScoreTime || 0) +
            (urlData.contentScoreTime || 0));

        urlFilterTimeTotal += (urlData.urlFilterTime || 0);
        urlScoreTimeTotal += (urlData.urlScoreTime || 0);
        contentScoreTimeTotal += (urlData.contentScoreTime || 0);
        timeTotal += totalTime;

        var displayUrl = url;
        if (url.length > MAX_URL) {
            displayUrl = url.slice(0, MAX_URL/2) + "..." + url.slice(url.length - MAX_URL/2);
        }
        var urlScore = "" + Math.round(urlData.urlScore*100)/100;
        var contentScore = "" + Math.round(urlData.contentScore*100)/100;

        return e('tr', {key: id}, [
            e('td', {key: 1, className: "url"}, [
                e('a', {onClick: () => viewScript(url)}, displayUrl),
            ]),
            (urlData.urlFiltered == 1) ?
                e('td', {key: 2, className: "bool fail",
                  dangerouslySetInnerHTML: {__html:
                      "&#9447; " + urlData.urlFilteredBy}}) :
                e('td', {key: 2, className: "bool pass",
                  dangerouslySetInnerHTML: {__html:
                      "&#10003;"}}),
            (urlData.urlBlocked == 1) ?
                e('td', {key: 3,
                    className: whitelist[url] ? "bool pass" : "bool fail",
                    dangerouslySetInnerHTML: {__html: "&#9447; " + urlScore}}) :
                e('td', {key: 3, className: "bool pass",
                    dangerouslySetInnerHTML: {__html: "&#10003; " + urlScore}}),
            (urlData.urlBlocked == 1) ?
                e('td', {key: 4, className: "bool"}, "-") : (
                  (urlData.contentBlocked == 1) ?
                      e('td', {key: 4,
                        className: whitelist[url] ? "bool pass" : "bool fail",
                        dangerouslySetInnerHTML: {__html:
                            "&#9447; " + contentScore}}) :
                      e('td', {key: 4, className: "bool pass",
                        dangerouslySetInnerHTML: {__html:
                            "&#10003; " + contentScore}})
                ),
            e('td', {key: 5, className: "time"}, Math.round(totalTime) + " ms"),
            (urlData.blocked !== 1 && !whitelist[url]) ?
                e('td', {key: 6}) :
                e('td', {key: 6, className: "check"}, [
                    e('input', {
                        type: "checkbox",
                        checked: whitelist[url],
                        onChange: (e) => updateUrlWhitelist(e.target.checked, url)
                    })
                ])
        ]);
    }));

    rows.push(e('tr', {key: "__TIME__"}, [
        e('td', {key: 1, className: "url"}, "Time totals"),
        e('td', {key: 2, className: "time"},
          Math.round(urlFilterTimeTotal) + " ms"),
        e('td', {key: 3, className: "time"},
          Math.round(urlScoreTimeTotal) + " ms"),
        e('td', {key: 4, className: "time"},
          Math.round(contentScoreTimeTotal) + " ms"),
        e('td', {key: 5, className: "time"},
          Math.round(timeTotal) + " ms"),
        e('td', null),
    ]));

    return rows;
}

function downloadCSV(globalData) {
    // Create a CSV
    var csvRows = [
        ["URL,Total blocked,Bad total,Bad URL blocked,Bad content blocked," +
        "Bad URL filtered,Bad blocked,Good total,Good URL blocked," +
        "Good content blocked,Good URL filtered,Good whitelisted," +
        "Good blocked"]
    ];
    Object.keys(globalData.urlSummaries).forEach(key => {
        var row = globalData.urlSummaries[key];
        var shouldBeBlocked = row.shouldBeBlocked || {};
        var shouldNotBeBlocked = row.shouldNotBeBlocked || {};
        csvRows.push([
            key,
            row.totalBlocked,
            shouldBeBlocked.total,
            shouldBeBlocked.urlBlocked,
            shouldBeBlocked.contentBlocked,
            shouldBeBlocked.filtered,
            shouldBeBlocked.blocked,
            shouldNotBeBlocked.total,
            shouldNotBeBlocked.urlBlocked,
            shouldNotBeBlocked.contentBlocked,
            shouldNotBeBlocked.filtered,
            shouldNotBeBlocked.whitelisted,
            shouldNotBeBlocked.blocked,
        ].join(","));
    });
    var file = new Blob([csvRows.join("\n")], {type: "application/csv"});

    // Create an anchor tag and click on it to start the download
    var el = document.createElement('a');
    el.setAttribute("href", URL.createObjectURL(file));
    el.setAttribute("download", "adBlockerData.csv");
    el.click();
}

function onOffSwitch(props) {
    return e('div', {className: "onoffswitch"}, [
        e('input', {
            type: "checkbox", className: "onoffswitch-checkbox", id: "onoff",
            checked: !props.domainWhitelisted,
            onChange: (e) => updateDomainWhitelist(!e.target.checked, props.domain)
        }),
        e('label', {className: "onoffswitch-label", htmlFor: "onoff"}, [
            e('span', {className: "onoffswitch-inner"}),
            e('span', {className: "onoffswitch-switch"}),
        ])
    ]);
}

function PopupContents(props) {
    var blockedDigits = ("" + props.globalData.totalScriptsBlocked).split("");
    return e('div', null, [
        e('div', {className: "section-header"}, [
            e('h1', null, 'Content-Aware Ad Blocker'),
            e('p', null, 'Ad blocker which uses machine learning ' +
                'to identify ad-serving scripts in your browser.'),
            e('p', null, 'This is a capstone project for the UC Berkeley ' +
                'Master of Information and Data Science program.'),
            e('div', {className: "button-wrapper"}, [
                e('a', {href: "https://samuelhkahn.github.io/capstone_page/",
                        target: "_blank", className: "button"},
                  'Visit the website'),
            ]),
        ]),
        e('div', {className: "section-summary"}, [
            e('p', {className: "blocked"}, [
                e('span', null, "Domain: "),
                e('span', {className: "float"}, [
                    props.domain || "",
                ]),
            ]),
            e('p', {className: "blocked"}, [
                e('span', null, "Ad-blocking on this domain is:"),
                e('span', {className: "float"}, [
                    onOffSwitch(props)
                ]),
            ]),
            e('p', {className: "blocked"}, [
                e('span', null, "Total scripts blocked: "),
                e('span', {className: "float"}, [
                    blockedDigits.map(digit => e('div', {className: 'digit'}, [digit])),
                ]),
            ]),
            e('p', {className: "blocked"}, [
                e('span', null, "Download detailed summary:"),
                e('span', {className: "float"}, [
                    e('a', {onClick: () => downloadCSV(props.globalData), className: "dl"},
                        [e('img', {src: "dl-icon.png"})]),
                ]),
            ]),
        ]),
        e('div', {className: "section-table"}, [
            e('h2', null, "Blocked item details"),
            e('table',
              {className: "table", cellPadding: 0, cellSpacing: 0, width: "100%"},
              [e('tbody', null,
                 renderTable(props.tabData, props.globalData.urlWhitelist))]),
        ])
    ]);
}

function getData() {
    chrome.runtime.sendMessage({
        from: "popup",
        action: "getScriptData"
    }, function(data) {
        console.log(data);
        ReactDOM.render(
            e(PopupContents, data, null),
            document.getElementById('content'));
    });
}

getData();
window.setInterval(getData, 5000);

console.log("Popup loaded!")
