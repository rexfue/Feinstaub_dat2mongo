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

set -x
port=""
orgName=fst-d2m
name=fst-d2m1

usage()
{
    echo "Usage build_and_copy.sh [-p port] [-n name] target"
    echo "   Build docker container $name and copy to target"
    echo "Params:"
    echo "   target: Where to copy the container to "
    echo "   -p port:   ssh port  (default 22)"
    echo "   -n name:   new name for container (default: $orgName)"
}

while getopts n:p:h? o
do
  case "$o" in
  n)  name="$OPTARG";;
  p)  port="-p $OPTARG";;
  h) usage; exit 0;;
  *) usage; exit 1;;
  esac
done
shift $((OPTIND-1))

while [ $# -gt 0 ]; do
        if [[ -z "$target" ]]; then
                target=$1
                shift
        else
                echo "bad option $1"
                # exit 1
                shift
        fi
done

docker build -f Dockerfile_$orgName -t $name .

dat=`date +%Y%m%d%H%M`
ssh $port $target "docker tag $name $name:V_$dat"
docker save $name | bzip2 | pv | ssh $port $target 'bunzip2 | docker load'
