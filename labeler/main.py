from itertools import chain, izip
import json
import random

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

# Filter out inline scripts for now
extern_table = [i for i in table if i["inline"] == False]

# Collapse all duplicates
scripts_table = {}
for item in extern_table:
    if item["sha"] not in scripts_table:
        scripts_table[item["sha"]] = item
        scripts_table[item["sha"]]["count"] = 0

    for entry in item:
        if entry.startswith("flag-"):
            if item[entry] == 1:
                scripts_table[item["sha"]][entry] = 1

    scripts_table[item["sha"]]["count"] += 1

dedup_table = scripts_table.values()

positive_examples = [i for i, e in enumerate(dedup_table) if e["flag-any"] == 1]
negative_examples = [i for i, e in enumerate(dedup_table) if e["flag-any"] == 0]
random.seed(1492)
random.shuffle(positive_examples)
random.shuffle(negative_examples)
# Randomly select the same number of negative examples as we have positive examples
negative_examples = negative_examples[:len(positive_examples)]
print "%d scripts labeled." % len(table)
print "%d external scripts" % len(extern_table)
print "%d deduplicated scripts." % len(dedup_table)
print "%d positive + %d negative examples = %d total." % (
    len(positive_examples), len(negative_examples),
    len(positive_examples)+len(negative_examples))

balanced_table = [
    dedup_table[i]
    for i in chain.from_iterable(izip(positive_examples, negative_examples))]

with open("/var/scripts/table_balanced.json", "w") as f:
    json.dump(balanced_table, f)
