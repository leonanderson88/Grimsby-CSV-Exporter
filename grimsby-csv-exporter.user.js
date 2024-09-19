// ==UserScript==
// @name         Grimsby CSV Exporter
// @namespace    http://tampermonkey.net/
// @version      2024-04-16
// @description  Allow export of Grimsby events to csv file. Correct date formatting for excel. Split out links to seperate column
// @author       Leon Anderson <lleoand@amazon.com>
// @match        https://grimsby.bots.aws.a2z.com/activities
// @exclude      https://grimsby.bots.aws.a2z.com/activities/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=a2z.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    //console.log("START");

    function waitForElement(root, selector) {
        return new Promise((resolve, reject) => {
            (new MutationObserver(check)).observe(root, {childList: true, subtree: true, });
            function check(changes, observer) {
                console.log("checking");
                let element = root.querySelector(selector);
                if(element) {
                    //console.log("FOUND ELEMENT:", element);
                    observer.disconnect();
                    resolve(element);
                }
            }
        });
    }

    function getTableData(forAsana){
        let table = document.querySelector('table');

        let headers = table.querySelectorAll('thead th div[class*="awsui_header-cell-text"]');
        let rows = table.querySelectorAll('tbody tr');

        let headersArray = [];
        let outputHeadersArray = [];
        let outputArray = [];

        headers.forEach((element)=>{
            headersArray.push(element.innerHTML);

            outputHeadersArray.push(element.innerHTML);
            switch (element.innerHTML.toLowerCase()){
                case 'activity name':
                    outputHeadersArray.push('Grimsby Link');
                    break;
                case 'lms locator id':
                    outputHeadersArray.push('Kiku Link');
                    break;
            }
        });

        //console.log("HEADERS ARRAY:", headersArray)
        //console.log("OUTPUT HEADERS ARRAY:", outputHeadersArray)

        rows.forEach((element)=>{
            let cells = element.querySelectorAll('td > span');
            let rowArray = [];

            //console.log("ROW:", element);
            //console.log("ROW ITEMS LENGTH:", Object.keys(cells).length);

            cells.forEach((cellElement, i)=>{
                let a;
                let innerText = cellElement.innerText;
                innerText = innerText.replace(/^-$/gm, '');
                innerText = innerText.replace(/\n+/gm, ',');

                if (innerText.indexOf(',') > -1) {
                    innerText = '"' + innerText + '"';
                }

                //console.log("CELL ELEMENT:", cellElement);
                //console.log("INDEX", i);

                switch (headersArray[i].toLowerCase()){
                    case 'activity name':
                    case 'lms locator id':
                        a = cellElement.querySelector('a');
                        if(a){
                            rowArray.push(a.innerText);
                            rowArray.push(a.href);
                        }else{
                            rowArray.push(innerText);
                            rowArray.push("");
                        }
                        break;
                    case 'start date':
                    case 'end date':
                        rowArray.push(convertGrimsbyDateFormat(innerText, forAsana));
                        break;
                    default:
                        rowArray.push(innerText);
                        break;
                }
            });

            outputArray.push(rowArray);
        });

        outputArray.unshift(outputHeadersArray);

        return outputArray;
    }

    function convertGrimsbyDateFormat(dateString, forAsana){
        let oldDateFormat = new Date(dateString)
        let newDateFormat = (forAsana)?
            oldDateFormat.toLocaleDateString('en-US'):
        oldDateFormat.toLocaleDateString('en-GB', {day: "numeric", month:"short", year: "numeric"});
        return newDateFormat;
    }

    function zeroPad(num, places) {
        return String(num).padStart(places, "0");
    }

    function formatDateforFileName(inputDate) {
        return `${inputDate.getFullYear()}_${zeroPad(
            inputDate.getMonth() + 1,
            2
        )}_${zeroPad(inputDate.getDate(), 2)}_${zeroPad(
            inputDate.getHours(),
            2
        )}_${zeroPad(inputDate.getMinutes(), 2)}`;
    }

    function convertToCSV(arrayData) {
        let csvContent = "";

        //console.log("ARRAY DATA:", arrayData);

        arrayData.forEach((row)=>{
            let rowData = row.join(",");
            csvContent += rowData + "\r\n";
        });

        return csvContent;
    }

    function startDownload(forAsana){

        //console.log("START DOWNLOAD CLICK");

        let csvData = convertToCSV(getTableData(forAsana));

        //console.log("CSV DATA:", csvData);

        let element = document.createElement('a');

        element.setAttribute(
            "href",
            "data:text/plain;charset=utf-8," + encodeURIComponent(csvData)
        );
        element.setAttribute("download", `classes_${formatDateforFileName(new Date())}.csv`);
        element.style.display = "none";

        if (typeof element.download != "undefined") {
            //browser has support - process the download
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        } else {
            //browser does not support - alert the user
            alert('This functionality is not supported by the current browser, recommend trying with Google Chrome instead.  (http://caniuse.com/#feat=download)');
        }
    }

    function appendDownloadButton(buttonGroup, forAsana){
        // let saveFiltersButton = await waitForElement(document, '[data-testid="ActivityListActionsSaveFilters"]');
        let button = document.createElement("awsui-button");
        let buttonInner = document.createElement("button");
        let span = document.createElement("span");

        span.innerHTML = (forAsana)?"Download CSV (ASAN) (US date format)":"Download CSV";
        span.setAttribute("awsui-button-region", "text");

        buttonInner.append(span);
        buttonInner.classList.add("awsui-button", "awsui-button-variant-primary","awsui-hover-child-icons");
        buttonInner.addEventListener('click', ()=>{startDownload(forAsana)});

        button.append(buttonInner);

        //saveFiltersButton.parentNode.insertBefore(button, saveFiltersButton);
        buttonGroup.append(button);
    }

    window.addEventListener('load', async () => {
        //console.log("WINDOW LOADED");

        let buttonGroup = await waitForElement(document, '.awsui-util-action-stripe-group');

        appendDownloadButton(buttonGroup, true);
        appendDownloadButton(buttonGroup, false);
    }, false);
})();