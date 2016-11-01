const MAX_URL = 85;

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

function renderTable(data) {
    var allIds = {};
    var existingIds = {};
    Object.keys(data).forEach(url => allIds[hash(url)] = 1);

    var table = document.getElementById("urlTable");
    var childrenToDelete = [];
    table.childNodes.forEach(child => {
        if (!child.getAttribute) {
            return;
        }
        var id = child.getAttribute("data-id");
        if (id == "header") {
            return;
        }
        if (!allIds[id]) {
            console.log("Deleting id", id);
            childrenToDelete.push(child);
        } else {
            existingIds[id] = 1;
        }
    });

    childrenToDelete.forEach(child => table.removeChild(child));

    Object.keys(data).forEach(url => {
        var id = hash(url);
        if (existingIds[id]) {
            console.log("Skipping id", id);
            return;
        }

        console.log("Creating id", id);
        var urlData = data[url];
        var displayUrl = url;
        if (url.length > MAX_URL) {
            displayUrl = url.slice(0, MAX_URL/2) + "..." + url.slice(url.length - MAX_URL/2);
        }
        var urlScore = "" + Math.round(urlData.urlScore*100)/100;
        var contentScore = "" + Math.round(urlData.contentScore*100)/100;

        var contents = [
            [displayUrl, "url"],
            (urlData.urlFiltered == 1) ? ["&#9447; " + urlData.urlFilteredBy, "bool fail"] : ["&#10003;", "bool pass"],
            (urlData.urlBlocked == 1) ? ["&#9447; " + urlScore, "bool fail"] : ["&#10003; " + urlScore, "bool pass"],
            (urlData.urlBlocked == 1) ? ["-", "bool"] : (
                (urlData.contentBlocked == 1) ? ["&#9447; " + contentScore, "bool fail"] : ["&#10003; " + contentScore, "bool pass"]),
        ];

        var tr = document.createElement("tr");
        tr.setAttribute("data-id", id);

        var tds = contents.map(info => {
            var td = document.createElement("td");
            td.innerHTML = info[0];
            td.setAttribute("class", info[1]);
            tr.appendChild(td);
            return td;
        });
        table.appendChild(tr);
    });
}
function getData() {
    chrome.runtime.sendMessage({
        from: "popup",
        action: "getScriptData"
    }, function(data) {
        renderTable(data);
    });
}

getData();
window.setInterval(getData, 5000);
console.log("Popup loaded!")
