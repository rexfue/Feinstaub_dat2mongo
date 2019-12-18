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
name=fst-d2m


if [ $# -lt 1 ]
  then
    echo "Usage buildit_and_copy.sh target [port]"
    echo "   Build docker container $name and copy to target"
    echo "Params:"
    echo "   target: Where to copy the container to "
    echo "   port:   ssh port if not 22 < use: '-p xxxx' > (optional)"
    exit
fi


 docker build -f Dockerfile_$name -t $name .

if [ "$2" != "" ]
then
    port=$2
fi
dat=`date +%Y%m%d%H%M`
ssh $port $1 "docker tag $name $name:V_$dat"
docker save $name | bzip2 | pv | ssh $port $1 'bunzip2 | docker load'
