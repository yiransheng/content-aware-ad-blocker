# -*- coding: utf-8 -*-
"""
Spyder Editor

This is a temporary script file.
"""

import seaborn as sns
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

x = ['Random2Vec','AST2Vec','Word2Vec','AST','RegEx+\nAST','BiRegEx','BiRegEx+\nWord2Vec','BiRegEx+\nURL6']
y=[88.1,90.1,90.4,91.6,91.9,92.1,92.3,96.5]
colors=['green','green','green','red','red','blue','blue','red']
df = pd.DataFrame(dict(x=x, y=y, color=colors))

sns.axes_style('white')
sns.set_style('white')

x=np.array(x)
y=np.array(y)

#plot = sns.barplot(x=x, y=y,palette=colors,legend=False)

g = sns.factorplot("x", "y", data=df,
                    kind="bar",
                   size=6, palette=colors)
g.set(ylim=(85, 100))
g.set(ylabel='Accuracy')
g.set(xlabel='Extracted Feature')

g.set_xticklabels(rotation=30)
plt.legend(loc='upper left')
#for item in g.get_xticklabels():
#    item.set_rotation(30)

