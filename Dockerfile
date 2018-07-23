FROM node:9-alpine

ADD package.json /tmp/package.json
RUN cd /tmp && npm install
RUN mkdir -p /opt/app && cp -a /tmp/node_modules /opt/app/
RUN mkdir /opt/app/data 

ENV MONGOHOST fst-mongo

WORKDIR /opt/app
ADD dat2mongo.js location.js readFromcvs.js package.json jquery.csv.js /opt/app/
ADD data/mysids.txt /opt/app/data

RUN touch crontab.tmp \
    && echo '*/5 * * * *      cd /opt/app && node ./dat2mongo.js  >>/var/log/dat2mongo.log 2>&1' > crontab.tmp \
    && echo '2   * * * *      cd /opt/app && node ./location.js   >>/var/log/location.log  2>&1' >> crontab.tmp \
    && echo '4   9 * * *      cd /opt/app && node ./readFromcvs.js >>/var/log/readFrom.log  2>&1' >> crontab.tmp \
    && crontab crontab.tmp \
    && rm -rf crontab.tmp


RUN touch cmds.sh \
	&& echo 'crond -f' >cmds.sh

CMD sh ./cmds.sh

