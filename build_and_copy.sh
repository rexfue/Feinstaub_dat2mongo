#!/bin/bash
# Build Docker-Container
#
# Call: buildit.sh name [target]
#
# The Dockerfile must be named like Dockerfile_name
#
# 2018-09-20 rxf
#   -  before sending docker image to remote, tag actual remote image
#
# 2018-09-14  rxf
#   - first Version
#

# set -x
port=""

if [ $# -lt 1 ]
  then
    echo "Usage buildit_and_copy.sh name [target]"
    echo "   name:   Name of container"
    echo "   target: Where to copy the container to (optional)"
    exit
fi

 docker build -f Dockerfile_$1 -t $1 .

if [ "$2" != "" ]
then
  if [ "$3" != "" ]
  then
    port=$3
  fi
  dat=`date +%Y%m%d%H%M`
  ssh $port $2 "docker tag $1 $1:V_$dat"
  docker save $1 | bzip2 | pv | ssh $port $2 'bunzip2 | docker load'
fi