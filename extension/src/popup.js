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

function updateWhitelist(checked, url) {
    chrome.runtime.sendMessage({
        from: "popup",
        action: "updateWhitelist",
        url: url,
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

        saveAs(file, url.replace(/\s+/g, '_') + '.html'); 
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
                e('a', {onClick: () => viewScript(url), onDoubleClick: ()=> window.open(url,'_blank')}, displayUrl),
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
            (urlData.urlBlocked !== 1 && urlData.contentBlocked !== 1) ?
                e('td', {key: 6}) :
                e('td', {key: 6, className: "check"}, [
                    e('input', {
                        type: "checkbox",
                        checked: whitelist[url],
                        onChange: (e) => updateWhitelist(e.target.checked, url)
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

function PopupContents(props) {
    return e('div', null, [
        e('p', null, 'This is an ad blocker which uses machine learning ' +
            'to identify ad-serving scripts in your browser.'),
        e('p', null, 'This is a capstone project for the UC Berkeley ' +
            'Master of Information and Data Science program.'),
        e('p', {className: "blocked"}, [
            e('span', null, "Total scripts blocked: "),
            e('span', null, "" + props.globalData.totalScriptsBlocked),
            e('span', null, ". Download data "),
            //e('a', {href: url, download: "adBlockerData.csv"}, "here"),
            e('a', {onClick: () => downloadCSV(props.globalData)}, "here"),
        ]),
        e('h2', {style: {marginBottom: 0, marginTop: 30}},
          "Scripts loaded on this page"),
        e('table',
          {className: "table", cellPadding: 0, cellSpacing: 0, width: "100%"},
          [e('tbody', null,
             renderTable(props.tabData, props.globalData.urlWhitelist))]),
    ]);
}

function getData() {
    chrome.runtime.sendMessage({
        from: "popup",
        action: "getScriptData"
    }, function(data) {
        ReactDOM.render(
            e(PopupContents, data, null),
            document.getElementById('content'));
    });
}

getData();
window.setInterval(getData, 5000);

console.log("Popup loaded!")
