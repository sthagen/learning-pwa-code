// @ts-check

/* eslint-env browser */
(function () {
    // @ts-ignore
    window.chartColors = {
        red: 'rgb(255, 99, 132)',
        orange: 'rgb(255, 159, 64)',
        yellow: 'rgb(255, 205, 86)',
        green: 'rgb(75, 192, 192)',
        blue: 'rgb(54, 162, 235)',
        purple: 'rgb(153, 102, 255)',
        grey: 'rgb(201, 203, 207)'
    };

    /**
     * @param {string | string[]} theStr 
     */
    function toTitleCase(theStr) {
        // borrowed from:
        // https://gomakethings.com/converting-a-string-to-title-case-with-vanilla-javascript/
        theStr = theStr.toLowerCase().split(' ');
        for (var i = 0; i < theStr.length; i++) {
            theStr[i] = theStr[i].charAt(0).toUpperCase() + theStr[i].slice(1);
        }
        return theStr.join(' ');
    };

    /** 
     * @param {number} num 
     */
    function formatNumber(num) {
        // people seem to hate using commas in numbers nowadays
        // so, of course, I had to have them here
        // https://blog.abelotech.com/posts/number-currency-formatting-javascript/
        return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
    };

    /**
     * @param {*} chartData 
     */
    function renderSentimentData(chartData) {
        console.log('Rendering Sentiment data');
        // Built from this sample: https://www.chartjs.org/samples/latest/charts/pie.html
        var ctx = document.getElementById('myChart').getContext('2d');
        // Populate the attribData array with our sentiment data
        var attribData = [];
        var labelData = []
        for (var attribute in chartData) {
            let titleAttrib = toTitleCase(attribute);
            attribData.push(chartData[attribute]);
            labelData.push(titleAttrib);
            // Update the table on the page
            document.getElementById(`val${titleAttrib}`).innerHTML = formatNumber(chartData[attribute]);
        }

        var data = {
            datasets: [{
                data: attribData,
                backgroundColor: [
                    window.chartColors.red,
                    window.chartColors.orange,
                    window.chartColors.grey,
                    window.chartColors.green,
                    window.chartColors.blue,
                    window.chartColors.purple,
                ]
            }],
            labels: labelData,
        };

        var myDoughnutChart = new Chart(ctx, {
            type: 'doughnut',
            data: data,
            options: {
                responsive: true,
                legend: { position: 'bottom' }
            }
        });
    };

    function getSentimentData() {
        console.log('getSentimentData()');
        // Do we have a network connection?
        // Build the URL to the app's APIs
        const serverUrl = `${location.origin}/api/sentiment`;
        console.log(`Getting data from ${serverUrl}`);
        // See if you can get the data from the network
        fetch(serverUrl)
            .then(res => {
                console.log('Received data from the server');
                res.json()
                    .then(chartData => {
                        // Update the page with the new data
                        renderSentimentData(chartData);
                        // Set the data source element in the footer
                        document.getElementById('sourceValue').textContent = DATA_SOURCES[0];
                    })
            })
            .catch(error => {
                let msg = `Error fetching data: ${error}`;
                console.error(msg);
                // update the Source and data state values in the footer
                document.getElementById('sourceValue').textContent = DATA_STATES[2];
                // display a warning dialog (using Sweet Alert 2)
                Swal.fire('Data Error', msg, 'error');
            });
    };

    /**
     * 
     * @param {string} selectedSentiment 
     */
    function postFeedback(selectedSentiment) {
        console.log('postFeedback()');
        // Build the URL to the app's APIs
        const serverUrl = `${location.origin}/api/sentiment`;

        console.log(`Submitting data to ${serverUrl}`);
        // the data we're passing to the server
        const data = { sentiment: selectedSentiment };
        // POST the data to the server
        // method: 'POST', mode: 'cors', cache: 'no-cache',
        // credentials: 'same-origin',
        // headers: { 'Content-Type': 'application/json' },
        // referrer: 'no-referrer', 
        // body: JSON.stringify(data), 
        fetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
            .then(response => {
                console.log('Received response from the server');
                if (response.status == 201) {
                    // it worked
                    console.log('Sentiment submitted');
                    // Update the page with the latest data
                    getSentimentData();
                } else {
                    // Tell the user it failed
                    Swal.fire('POST Error', response.statusText, 'error');
                }
            });
    };

    /**
     * 
     * @param {string} selectedSentiment 
     */
    function saveFeedback(selectedSentiment) {
        console.log('saveFeedback: Opening IndexedDB database');
        // Open the feedback database
        var theDB = window.indexedDB.open(DB_NAME, DB_VERSION);

        // define the database error callback
        // all child errors bubble up to here
        theDB.onerror = function (event) {
            let msg = `Database error ${theDB.error}`;
            console.error(`saveFeedback: ${msg}`);
            Swal.fire('Database Error', msg, 'error');
        };

        // success callback
        theDB.onsuccess = function (event) {
            console.log('saveFeedback: Successfully opened database');
            // get a handle to the database
            var db = event.target.result;
            // Now lets add the sentiment to the object store
            var request = db.transaction([STORE_NAME], "readwrite")
                .objectStore(STORE_NAME)
                .add({ timestamp: Date.now(), sentiment: selectedSentiment });

            request.onsuccess = function (event) {
                console.log('saveFeedback: Successfully added feedback');
                navigator.serviceWorker.ready.then(reg => {
                    console.log('saveFeedback: Registering sync event');
                    // fire off the sync request
                    reg.sync.register('feedback');
                }).catch(function () {
                    // couldn't register the sync event
                    // so do this the old fashioned way
                    postFeedback(selectedSentiment);
                });
            };
        };

        theDB.onupgradeneeded = function (event) {
            console.log('saveFeedback: Database upgrade needed');
            // get a handle to the database
            var db = event.target.result;
            // does the store already exist?
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // No? Then create it
                console.log(`saveFeedback: Creating store ${STORE_NAME}`);
                // First create the configuration options for the store
                var storeOptions = { keyPath: "idx", autoIncrement: true };
                // then create the store
                var theStore = db.createObjectStore(STORE_NAME, storeOptions);
            };
        };
    };

    function submitFeedback() {
        // the user tapped the Share Sentiment button
        console.log('submitFeedback()');
        // get the selected item from the form
        var theSelect = document.getElementById("sentiment");
        let selectedSentiment = theSelect.options[theSelect.selectedIndex].value;
        // do we have a sentiment selected? we should
        if (selectedSentiment) {
            console.log(`submitFeedback: '${selectedSentiment}' selected`);
            // is IndexedDB supported?
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                // Yes, save the feedback to the database
                saveFeedback(selectedSentiment);
            } else {
                // Service worker or sync not supported
                // so do this the old fashioned way
                postFeedback(selectedSentiment);
            }
        }
    };

    // set the onClick event for the `btnShare` button
    document.getElementById("btnShare").addEventListener("click", submitFeedback);

    // Go get the data for the page
    getSentimentData();

})();
