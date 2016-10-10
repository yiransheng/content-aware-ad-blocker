install.packages(c('rzmq','repr','IRkernel','IRdisplay','ggplot2'),
                 repos = c('http://irkernel.github.io/', 'http://cran.rstudio.com'),
                 type = 'source')
IRkernel::installspec()
