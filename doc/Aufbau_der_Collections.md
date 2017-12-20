##Feinstaub

### Aufbau der Collections
Jeder Sensor bekommt 2 identisch aufgebaute Collections. Die Collection **SID_current** enthält die 
aktuellen Daten, die Collection **SID_saved** enthält **alle** Daten von vor ca. 1 Jahr bis *gestern* ( oder 
auch *vorgestern*, ja nachdem wir aktuell *luftadaten.info* die CSV-Dateien hält). 
Zusätzlich gibt es für alle Sensoren eine gemainsame Collection mit den Eigenschaften (**properties**)

	# SID_current / SID_saved

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

.  	

    ## Properties
	sid: 140,
	name: 'SDS011',
	since_date: '1900-01-01'
    location: {
        id: 345,
        latitude: 48.567,
        longitude: 9.1599,
        altitude: 280,
        since_date: '1900-01-01'
        adress: {
           number: '66a',
           street:  'Forststrasse',
           plz: 70176.
           city:  'Stuttgart'
           region: 'Baden-Württemberg',
           country: 'Germany'
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
	
		

### Aktuell einlaufende Daten
Diese werden in den Collections **SID_current** eingetragen. Sie werden alle 5min vom *luftdaten.info*-Server 
abgeholt. Es werden max. 32 Tage gespeichert (TTL-Index).  
**Index** ist auf den Zeitstempel (datetime) datetime der einzelnen Werte-Dokumente

###Dauerwerte
Diese werden jeden Tag (1x, z.B. mittags um 12) vom Luftdatenserver geholt und in die *große* Datenbank eingetragen 
(**SID_saved**). Deren Aufbau ist genau wie die **SID_current**.  Die Haltedauer dieser daten wird auf 400 
Tage festgelegt.  
Jede Collection hat einen **Index** auf den Zeitstempel (**datetime**).

###Location-Tabelle
Hier werden für jeden Sensor die Ortskoordinaten, die Adresse und die zum Standort gehörenden anderen Sensoren 
eingetragen. Aufbau siehe oben, die Collection heißt **properties**.  
Diese Collection wird 1x pro Tag aus den gerade aktuellen Daten erneuert bzw. ergänzt. 

###Ablauf
1. **Regelmäßige Updates**  
Alle 5 Minuten werden die aktuellen Daten von *https://api.luftdaten.info/static/v1/data.json* abgeholt, geparsed 
und in die Datenbank *Feinstaub* entsprechend der obigen Struktur eingetragen. Alle neu aufgetauchten Sensoren werden
in eine Datei namens *newsids.txt*, die im Verzeichnis *data* liegt, eingetragen. 
2. **Adress-Updates**  
Einmal am Tag (um 15:00) wird diese
Datei durchsucht und für alle darin enthaltenen Sensor-Nummern mit Hilfe der Orts-Koordinaten von der Googel-API die
Höhe und die Adresse geholt un in der Collection *properties* eingetragen. Da die Google-API im Zugriff beschränkt
ist (max. 2500 requests/day) werden max. 1000 Sensor-Nummer pro Tag verarbeitet. 
3. **Langfristige Daten**  
Ebenfalls einmal pro Tag wird die komplette CSV-Datei von *gestern* eingelesen und in der DB gespeichert. Auch hier
werden neue Sensornummern in der Datei *newsids.txt* gespeichert.
4. **Erstinbetriebnahem**  
Da das Parsen und Abspeichern einer CSV-Datei doch recht lang dauert /1/2-1 Stunde) wird der Aufbau der Datenbank für
die langfristigen Daten extra durchgeführt. Der Ablauf ist genau wie bei dem täglichen Einlesen der CVS-Dateien. 
Besonders hier kommt die Beschränkung bei Google beim Updaten der Adressen zum Tragen.



###Programme
* **d2mongo.js**  
  * Zweck:  
  Einlesen und Abspeichern der laufenden Daten all 5min (cron gesteuert)
  * Aktionen:  
    * Abholen der Datern vom Luftdaten-Server
    * Parsen der Daten nach den einzelene Sensoren
    * Schreiben der Sensor-Date in die Datenbank
    * Speichern der Nummern neuer Sensoren
    
* **readFreomCSV**
  * Zweck:  
  Einlesen und Abspeichern der verganegene daten aus den CSV-Dateien
  * Aktionen:
    * Abholen der CSV-Dateien für jeden Sensor für den angegebeben Tag (*gestern*)
    * Parsen dieser Daen
    * Speichern in der Datenbank
  
Zum Einlesen der CSV-Date einmal täglich
* **



rxf 2017-12-12