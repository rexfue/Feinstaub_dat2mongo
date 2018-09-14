#!/bin/bash
# Build Docker-Container
#
# Call: buildit.sh name [target]
#
# The Dockerfile_fst-data mus be named like Dockerfile_name
#
# 2018-09-14  rxf
#
#set -x
if [ $# -lt 1 ]
  then
    echo "Usage buildit_and_copy.sh name [target]"
    echo "   name:   Name of container"
    echo "   target: Where to copy the container to (optional)"
    exit
fi

docker build -f Dockerfile_$1 -t $1 .

if [ $2 != "" ]
then
    docker save $1 | bzip2 | pv | ssh $2 'bunzip2 | docker load'
fi