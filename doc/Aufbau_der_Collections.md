##Feinstaub

### Aufbau der Collections
Jeder Sensor bekommt 2 identisch aufgebaute Collections. Die Collection **SID_current** enthält die aktuellen Daten, die Collection **SID_saved** enthält **alle** Daten von Anfang an bis *gestern* ( oder auch *vorgestern*, ja nachdem wir aktuell *luftadaten.info* doe CSV-Dateien hält). Zusätzlich gibt es für jeden Sensor noch die Collection **SIUD_daymean** mit den Tages-Mittelwerten.

	# SID_current / SID_saved

	properties: {
		name: 'SDS011',
		since_date: '1900-01-01'
		location: {
			loc_id: 345,
			latitude: 48.567,
			longitude: 9.1599,
			altitude: 280,
			since_date: '1900-01-01'
			adress: {
               street:  'Forststr. 66a',
               plz: 70176.
               city:  'Stuttgart'
               country: 'Germany'
			}
		}
	}
	
	othersensors: [ 
		{
			sid: 141,
			since_date: '1900-01-01'
		}, {
			...
		}
	]
	
		
	{ 
		datetime: '2017-12-05T12:34:00Z',
		P10: 12.45,
		P2_5: 3.56,
		P10_m24: 23.6,
		P2_5_m24: 4.5
	}
	
	{
		....
	} 
	
	oder
	
	{
		temperature: 12.5,
		humidity: 56,
		pressure: 9887.6
		temperature_m24: 10.5,
		humidity_m24: 45,
		pressure_m24: 9800.6
	}

 

	# SID_daymean
	
	{
		date: 2017-11-23,
		P10_min: 12.34,
		P10_max: 56.5,
		P10_m24: 33.5,
		P2_5_min: 2.34,
		P2_5_max: 6.5,
		P2_5_m24: 3.5,
	}
	oder
	{
		date: 2017-11-23,
		temperature_mim: -5.5
		temperature_max:	22.3
		temperature_m24: 10.0
		humidity_min: 30,
		humidity_max: 98.7,
		humidity_m24: 66.6,
		pressure_min: 948,
		pressure_max: 1034,
		pressure_m24: 1000,
	}
	



### Aktuell einlaufende Daten
Diese werden in den Collections **SID_current** eingetragen. Sie werden alle 5min vom *luftdaten.info*-Server abgeholt. Es werden max. 32 Tage gespeichert (TTL-Index).  
Die 24h-Mittelwerte werden laufen mitgerechnet und mit gespeichert. Täglich um 0h00 bzw. direkt davor werden sie zusätzlich in der Collection für die Tagesmittelwerte gespeichert.  
**Index** ist auf den Zeitstempel (datetime) datetime der einzelnen Werte-Dokumente

###Tagesmittelwerte
Diese werden in den Collections **SID_daymean** täglich um 0h00 für den vergangenen Tag gespeichert. **Index** ist das Datum (date).  
###Dauerwerte
Diese werden jeden Tag (1x, z.B. mittags um 12) vom Luftdatenserver geholt und in die *große* Datenbank eingetragen (**SID_saved**). Deren Aufbau ist genau wie die **SID_current**.    
Jede Collection hat einen **Index** auf den Zeitstempel (**datetime**).

rxf 2017-12-05