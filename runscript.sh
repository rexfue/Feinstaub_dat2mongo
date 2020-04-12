while true 
do	
	start=`date +%s`
	export LIVE=true
	npm start
#	if [ $? -ne 0 ]
#	then
#	echo "error -> next loop"
#	continue
#	fi
	end=`date +%s`
	diff=$((end-$start))
	if [ $diff -gt 300 ]
	then
		continue
	fi
	while [ $diff -le 300 ]
	do
		sleep 10
		diff=$((`date +%s`-$start))
	done
done
