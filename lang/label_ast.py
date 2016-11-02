import random
import os
import pandas as pd

RATIO = 1.0 # percentage of flagged script
DATA_PATH = os.path.expanduser("~/data")

flags = pd.read_json("{}/table_balanced.json".format(DATA_PATH))
flags = flags.drop_duplicates(subset=['sha'])
flags.index = flags.sha

def filter_script(id, ast):
    if not id in flags.index:
        return
    if int(flags.loc[[id]]["flag-any"]) == 1.0:
        yield "1", ast
    elif random.random() < RATIO:
        yield "0", ast

if __name__ == '__main__':
    import fileinput
    for line in fileinput.input():
        id, ast = line.strip().split("\t")
        for label, ast in filter_script(id, ast):
            print "{}\t{}".format(label, ast)

