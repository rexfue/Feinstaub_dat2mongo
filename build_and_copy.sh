#!/bin/bash
# Build Docker-Container for fst-dsata
#
# Call: buildit.sh
#
set -x


docker build -f Dockerfile -t fst-data .

if [ $1 != "" ]
then
    docker save fst-data | bzip2 | pv | ssh $1 'bunzip2 | docker load'
fi