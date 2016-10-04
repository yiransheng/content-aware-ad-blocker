import json

from adblockparser import AdblockRules

def load_rules(name):
    with open("/app/%s.txt" % name, "r") as f:
        raw_rules = f.readlines()

    return AdblockRules(raw_rules)

rulesets = {}
counts = {"total": 0, "flag-any": 0}
FLAG_TYPES = ["easyprivacy", "easylist", "fanboy-social", "fanboy-annoyance"]
for name in FLAG_TYPES:
    rulesets[name] = load_rules(name)
    counts["flag-%s" % name] = 0

with open("/var/scripts/table.jsonl", "r") as f:
    table = [
        json.loads(line)
        for line in f.readlines()
    ]
print "Read %d lines from table" % len(table)

try:
    with open("/var/scripts/table_flag.json", "r") as f:
        prev_table = {
            "%s:%s" % (item["url"], item["sha"]): item
            for item in json.load(f)
        }
except:
    prev_table = {}
print "Loaded %d items from previous run." % len(prev_table)

flag_count, noflag_count = 0, 0
for idx in xrange(len(table)):
    item = table[idx]
    url, sha = item["url"], item["sha"]

    if ("%s:%s" % (url, sha)) in prev_table:
        item = prev_table["%s:%s" % (url, sha)]
        table[idx] = item
    else:
        item["flag-any"] = 0
        for name, rules in rulesets.iteritems():
            flag = rules.should_block(url)
            item["flag-%s" % name] = 1 if flag else 0
            if flag:
                item["flag-any"] = 1

    for name in (FLAG_TYPES + ["any"]):
        if item["flag-%s" % name] == 1:
            counts["flag-%s" % name] += 1

    counts["total"] += 1

    if counts["total"] % 100 == 0:
        print "Processed %d entries" % counts["total"]

for name, count in counts.iteritems():
    print "%s: %d" % (name, count)

with open("/var/scripts/table_flag.json", "w") as f:
    json.dump(table, f)
