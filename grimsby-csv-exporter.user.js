// ==UserScript==
// @name         Grimsby CSV Exporter
// @namespace    http://tampermonkey.net/
// @version      2024-09-19
// @description  Allow export of Grimsby events to csv file. Asana compatible with reminders set ahead of class start dates. Correct date formatting for excel. Split out links to seperate column
// @author       Leon Anderson <lleoand@amazon.com>
// @updateURL    https://github.com/leonanderson88/grimsby-csv-exporter/raw/refs/heads/main/grimsby-csv-exporter.user.js
// @downloadURL  https://github.com/leonanderson88/grimsby-csv-exporter/raw/refs/heads/main/grimsby-csv-exporter.user.js
// @match        https://grimsby.bots.aws.a2z.com/*
// @match        https://grimsby.bots.aws.a2z.com/activities
// @exclude      https://grimsby.bots.aws.a2z.com/activities/*
// @icon         data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAhJJREFUOBGVU01oE0EYfbOzaRuazQ+CjQf/aFGhIBWLGJRaPFgQC1WkWPDgxUMO1YPgpSBFeooeCop4yEUJCi3FQw6CnoTU9qCH2nooapBWsSpkSZpNGpud8dtJdqWRFDqw88333vvezDe7C2wzJjO/D4/cTx/ZRgKtGflw1uzjXP/IYC9dvfeiv5muqYFg6KIiDgkuwDt3bBANhVMS+EDPktmqp3ZsMNzN/kDKNQasvbxxvtLMgHjg3c/KHQrxRpEtEHn7ucB0XTcbOcofj8Yi43qNkAbAoo0iTjdExQ7c0chRa1RDl/RgLjcWaOP9fp+2zwG+ZL9iZfU7oh27nRTfzE0Vl99nsGEVENxVw/NmTkR7zu6hPdhEuSJOKxVN0zNpPE1NoVq1XQh2dRPpZAKvnj3ysHLJOkX9T9Rb8HBcGR5CsWjR0bkHct2Hi/Ex+AMhD3MX/xkc2L8XthAorBeVxsrnVTzY3QuN/zP1DATYdbqDywQMuGDJKmH8bgJCSqwszIIxDfHEE7QHI64E7QHjNdFT2s1YOBlsY4seQwvDCGDwwoBqg9NbOHPp2pZiR2uEwovPbw8l3RZ+ELbgEM6whfSfOBk7dOx4L+aXf8HX0goh7E9c4+WagmYpnBqoD8kD64vJ+dxRLpkynMu8Uaim8Z7UrUFvE7fGPYGbq+gzIlm5nj+nElb7Y1uqIrtFVE/+AopfnHn0oCa4AAAAAElFTkSuQmCC
// @grant        none
// ==/UserScript==

// For distribution
// https://github.com/leonanderson88/grimsby-csv-exporter/raw/refs/heads/main/grimsby-csv-exporter.user.js
// OLD DISTRO
// https://drive.corp.amazon.com/documents/lleoand@/greasemonkey_scripts/grimsby-csv-exporter.user.js

(function () {
  "use strict";

  //console.log("START");

  function waitForElement(root, selector) {
    return new Promise((resolve, reject) => {
      new MutationObserver(check).observe(root, {
        childList: true,
        subtree: true,
      });
      function check(changes, observer) {
        //console.log("checking");
        let element = root.querySelector(selector);
        if (element) {
          //console.log("FOUND ELEMENT:", element);
          observer.disconnect();
          resolve(element);
        }
      }
    });
  }

  function getDocumentTable() {
    let table = document.querySelector("table");
    let headers = table.querySelectorAll(
      'thead th div[class*="awsui_header-cell-text"]'
    );
    let rows = table.querySelectorAll("tbody tr");

    return [headers, rows];
  }

  function getTableData() {
    const [headers, rows] = getDocumentTable();

    let headersArray = [];
    let outputHeadersArray = [];
    let outputArray = [];

    headers.forEach((element) => {
      headersArray.push(element.innerHTML.trim());

      outputHeadersArray.push(element.innerHTML.trim());
      switch (element.innerHTML.trim().toLowerCase()) {
        case "activity name":
          outputHeadersArray.push("Grimsby Link");
          break;
        case "lms locator id":
          outputHeadersArray.push("Kiku Link");
          break;
      }
    });

    //console.log("HEADERS ARRAY:", headersArray)
    //console.log("OUTPUT HEADERS ARRAY:", outputHeadersArray)

    rows.forEach((element) => {
      let cells = element.querySelectorAll("td > div");
      let rowArray = [];

      //console.log("ROW:", element);
      //console.log("ROW ITEMS LENGTH:", Object.keys(cells).length);

      cells.forEach((cellElement, i) => {
        let a;
        let innerText = cellElement.innerText;
        innerText = innerText.replace(/^-$/gm, "");
        innerText = innerText.replace(/\n+/gm, ",");

        if (innerText.indexOf(",") > -1) {
          innerText = '"' + innerText + '"';
        }

        //console.log("CELL ELEMENT:", cellElement);
        //console.log("INDEX", i);

        switch (headersArray[i].toLowerCase()) {
          case "activity name":
          case "lms locator id":
            a = cellElement.querySelector("a");
            if (a) {
              rowArray.push(a.innerText);
              rowArray.push(a.href);
            } else {
              rowArray.push(innerText);
              rowArray.push("");
            }
            break;
          case "start date":
          case "end date":
            innerText = innerText.replace(/^"|"$/gm, "");
            rowArray.push(convertGrimsbyDateFormat(innerText));
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

  function getTableDataForAsana() {
    const [headers, rows] = getDocumentTable();

    const classObjectsArray = buildClassObjectsFromTable(headers, rows);

    const asanaTasksObjectArray =
      buildAsanaTaskDataStructure(classObjectsArray);

    let outputArray = [];

    // Create headers
    outputArray.push(Object.keys(asanaTasksObjectArray[0]));

    // Add all rows data
    asanaTasksObjectArray.map((obj) => {
      outputArray.push(Object.values(obj));
    });

    return outputArray;
  }

  function buildAsanaTaskDataStructure(classObjectsArray) {
    // 1. Sort classObjectsArray by date
    classObjectsArray.sort((class1, class2) => {
      return (
        new Date(class1.original_start_date) -
        new Date(class2.original_start_date)
      );
    });

    // 1.1 RETURN THE CLASSES IF NO DATE PROVIDED, CANT BUID THE REST WITHOUT A START DATE
    if (!classObjectsArray[0].original_start_date) {
      return classObjectsArray;
    }

    // 2. Batch classObjects by week and create week bundle
    let objectOfClassWeeks = {};
    classObjectsArray.map((classObject) => {
      let classDate = new Date(classObject.original_start_date);
      let classYear = classDate.getFullYear();
      let classQuarter = classDate.getQuarter();
      let classMonth = classDate.getMonth();
      let classWeekOfYear = classDate.getWeek();

      //Check the object/array exists or set it
      objectOfClassWeeks[classYear] = objectOfClassWeeks[classYear] || {};
      objectOfClassWeeks[classYear][classQuarter] =
        objectOfClassWeeks[classYear][classQuarter] || {};
      objectOfClassWeeks[classYear][classQuarter][classMonth] =
        objectOfClassWeeks[classYear][classQuarter][classMonth] || {};
      objectOfClassWeeks[classYear][classQuarter][classMonth][classWeekOfYear] =
        objectOfClassWeeks[classYear][classQuarter][classMonth][
          classWeekOfYear
        ] || [];

      // Push the class object
      objectOfClassWeeks[classYear][classQuarter][classMonth][
        classWeekOfYear
      ].push(classObject);
    });

    //console.log("CLASSES ORDERED IN OBJECT:", objectOfClassWeeks);

    // 3. Create reminder batches, Quarter ahead, Month ahead, 4 week reminder, 3 week reminder, 2 week go/no go, This week in training
    let outputTaskObjectsArray = [];
    Object.entries(objectOfClassWeeks).forEach((yearOfClass) => {
      //Each year of training
      Object.entries(yearOfClass[1]).forEach((quarterOfClass) => {
        // Each Quater of a given year
        let quarterCollectionOfClassObjects = [];
        Object.entries(quarterOfClass[1]).forEach((monthOfClass) => {
          // Each Month of a given quarter
          let monthCollectionOfClassObjects = [];
          Object.entries(monthOfClass[1]).forEach((weekofYearOfClass) => {
            // Each Week of given quater and year

            // Add all classes objects to Month variable as subtasks
            monthCollectionOfClassObjects =
              monthCollectionOfClassObjects.concat(
                duplicateArrayOfClassObjects(weekofYearOfClass[1])
              );
            // Add all classes objects to Quarter variable as subtasks
            quarterCollectionOfClassObjects =
              quarterCollectionOfClassObjects.concat(
                duplicateArrayOfClassObjects(weekofYearOfClass[1])
              );

            // Build the reminders for the week
            // -1. Week of training
            let weekAfterTrainingReminder = createAsanaWeeklyReminder(
              duplicateArrayOfClassObjects(weekofYearOfClass[1]),
              `ILT ran last week - W${weekofYearOfClass[0]} ${yearOfClass[0]}`,
              "These classes ran last week. This is a reminder to follow up with any post training comms etc.",
              "Week after",
              -1
            );

            // Build the reminders for the week
            // 0. Week of training
            let weekOfTrainingReminder = createAsanaWeeklyReminder(
              duplicateArrayOfClassObjects(weekofYearOfClass[1]),
              `ILT running this week - W${weekofYearOfClass[0]} ${yearOfClass[0]}`,
              "These classes are running this week. You can check for any class details in the Kiku links.",
              "Week of",
              0
            );
            // 1. 2 Weeks before training commences
            let weekMinus2OfTrainingReminder = createAsanaWeeklyReminder(
              duplicateArrayOfClassObjects(weekofYearOfClass[1]),
              `Reminder to confirm or cancel ILT - W${weekofYearOfClass[0]} ${yearOfClass[0]}`,
              "Each class subtask will start in the next 14 days. This is the final day to cancel without charge to the customer. Mark as complete if the customer has been notified and made a decision to cancel or proceed with each class.",
              "-2 Weeks",
              2
            );
            // 2. 3 Weeks before training commences
            let weekMinus3OfTrainingReminder = createAsanaWeeklyReminder(
              duplicateArrayOfClassObjects(weekofYearOfClass[1]),
              `Check if ILT needs promotion - W${weekofYearOfClass[0]} ${yearOfClass[0]}`,
              "Each class subtask has only 1 week left to promote if the registration numbers are low. Check the subtask’s grimsby link for an up-to-date registration number. Mark as complete if the classes have been promoted or do not require promotion to achieve maximum possible numbers.",
              "-3 Weeks",
              3
            );

            // 3. 4 Weeks before training commences
            let weekMinus4OfTrainingReminder = createAsanaWeeklyReminder(
              duplicateArrayOfClassObjects(weekofYearOfClass[1]),
              `Check ILT numbers - W${weekofYearOfClass[0]} ${yearOfClass[0]}`,
              "Each class subtask has 2 weeks left to promote if the registration numbers are low. Check the subtask’s grimsby link for an up-to-date registration number. Mark as complete when discussed with customer POC or reminder-to-register comms sent.",
              "-4 Weeks",
              4
            );

            // 4. Add all outputs together
            outputTaskObjectsArray = outputTaskObjectsArray.concat(
              weekAfterTrainingReminder,
              weekOfTrainingReminder,
              weekMinus2OfTrainingReminder,
              weekMinus3OfTrainingReminder,
              weekMinus4OfTrainingReminder
            );
          });
          // Create a reminder task at the end of the month run through
          // Add all classes as a subtask object and an object for the task itself
          let monthOfTrainingReminder = createAsanaMonthlyReminder(
            monthCollectionOfClassObjects,
            `ILT running ${Date.getMonthName(true, monthOfClass[0])} ${
              yearOfClass[0]
            }`,
            "A list of all ILT classes running this month. This task is a reminder and can be marked complete whenever suits your practice",
            "Month"
          );
          outputTaskObjectsArray = outputTaskObjectsArray.concat(
            monthOfTrainingReminder
          );
        });
        // Create a reminder task at the end of the quarter run through
        // Add all classes as a subtask object and an object for the task itself
        let quarterOfTrainingReminder = createAsanaQuarterlyReminder(
          quarterCollectionOfClassObjects,
          `ILT running Q${Number(quarterOfClass[0]) + 1} ${yearOfClass[0]}`,
          "A list of all ILT classes running this quarter. This task is a reminder and can be marked complete whenever suits your practice",
          "Quarter"
        );
        outputTaskObjectsArray = outputTaskObjectsArray.concat(
          quarterOfTrainingReminder
        );
      });
      // No reminder or action for the year
    });

    outputTaskObjectsArray.forEach((classObject) => {
      delete classObject?.original_start_date;
    });

    // console.log(
    //   "ALL CLASS OBJECTS AND REMINDERS ARRAY:",
    //   outputTaskObjectsArray
    // );

    // 4. Output the finished array
    return outputTaskObjectsArray;
  }

  function duplicateArrayOfClassObjects(arrayOfClassObjects) {
    let duplicateArray = [];
    arrayOfClassObjects.forEach((classObject) => {
      duplicateArray.push(JSON.parse(JSON.stringify(classObject)));
    });
    return duplicateArray;
  }

  function createAsanaWeeklyReminder(
    arrayOfClassObjects,
    activityName = "",
    description = "",
    color = "",
    offsetInWeeks = 0
  ) {
    // Weekly update if 0, 1, 2...
    arrayOfClassObjects.sort((class1, class2) => {
      return (
        new Date(class1.original_start_date) -
        new Date(class2.original_start_date)
      );
    });

    let mondayArray = [];
    let fridayArray = [];

    arrayOfClassObjects.forEach((classObject) => {
      let classDate = new Date(classObject.original_start_date);
      if (classDate.getDay() === 1) {
        fridayArray.push(classObject);
      } else {
        mondayArray.push(classObject);
      }
    });

    if (fridayArray.length > 0) {
      let fridayDueDate = new Date(fridayArray[0].original_start_date);

      // Set to previous Friday
      fridayDueDate.setDate(fridayDueDate.getDate() - 3);

      // Process offset in weeks
      fridayDueDate = fridayDueDate - offsetInWeeks * (7 * 24 * 60 * 60 * 1000);

      fridayDueDate = convertGrimsbyDateFormat(fridayDueDate, true);
      fridayArray = buildReminderObject(
        fridayArray,
        `${activityName} - Friday`,
        fridayDueDate,
        "",
        description,
        color
      );
    }

    if (mondayArray.length > 0) {
      // Get the earliest class start date
      let mondayDueDate = new Date(mondayArray[0].original_start_date);

      // Set to first day of the week
      mondayDueDate.setDate(
        mondayDueDate.getDate() - (mondayDueDate.getDay() - 1)
      );

      // Process offset in weeks
      mondayDueDate = mondayDueDate - offsetInWeeks * (7 * 24 * 60 * 60 * 1000);

      // Convert date object to Asana format MM/DD/YYYY string
      mondayDueDate = convertGrimsbyDateFormat(mondayDueDate, true);

      mondayArray = buildReminderObject(
        arrayOfClassObjects,
        activityName,
        mondayDueDate,
        "",
        description,
        color
      );
    }

    mondayArray = mondayArray.concat(fridayArray);

    return mondayArray;
  }

  function createAsanaMonthlyReminder(
    arrayOfClassObjects,
    activityName = "",
    description = "",
    color = "",
    offsetInWeeks = 0
  ) {
    // Get the first monday of the month
    arrayOfClassObjects.sort((class1, class2) => {
      return (
        new Date(class1.original_start_date) -
        new Date(class2.original_start_date)
      );
    });

    // Get the earliest class start date
    let startDate = new Date(arrayOfClassObjects[0].original_start_date);
    let endDate = new Date(arrayOfClassObjects[0].original_start_date);

    // Set the date to the 1st of the month
    startDate.setDate(1);

    // // Get the day of the week. 0-6
    // let dayOfWeek = startDate.getDay();
    // // Receprocal date, if Mon is 1st then 8th is Mon
    // dayOfWeek = 8 - dayOfWeek;
    // // If the day of the week is 7, set it to 0, no need to progress by a week
    // dayOfWeek = (dayOfWeek === 7)?0:dayOfWeek;
    // // Set the date by Day of week +1 as dates are 1-31 and dont' start from 0.
    // startDate.setDate(dayOfWeek + 1);

    // Get the day of the week. 0-6
    let dayOfWeek = startDate.getDay();
    // If day of week is Saturday or Sunday
    if (dayOfWeek === 0) {
      //Sunday progress by 1
      dayOfWeek = 2;
    } else if (dayOfWeek === 6) {
      // Saturday progress by 2
      dayOfWeek = 3;
    } else {
      // If not a weekend then set it to the first of the month
      dayOfWeek = 1;
    }
    // Set new start date
    startDate.setDate(dayOfWeek);

    // Process offset in weeks
    startDate = startDate - offsetInWeeks * (7 * 24 * 60 * 60 * 1000);

    // Convert date object to Asana format MM/DD/YYYY string
    startDate = convertGrimsbyDateFormat(startDate, true);

    // Set the end date of the month, go forward first to allow for 31st and 30th and 29th date issues
    endDate.setDate(1);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);

    // Get the day of the week. 0-6
    dayOfWeek = endDate.getDay();
    // If day of week is Saturday or Sunday
    if (dayOfWeek === 0) {
      //Sunday revert by 2
      dayOfWeek = -2;
    } else if (dayOfWeek === 6) {
      // Saturday progress by 2
      dayOfWeek = -1;
    } else {
      // If not a weekend then set it to the first of the month
      dayOfWeek = 0;
    }
    // Set new end date of the month, go forward first to allow for 31st and 30th and 29th date issues
    endDate.setDate(1);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(dayOfWeek);

    // Process offset in weeks
    endDate = endDate - offsetInWeeks * (7 * 24 * 60 * 60 * 1000);

    // Convert date object to Asana format MM/DD/YYYY string
    endDate = convertGrimsbyDateFormat(endDate, true);

    return buildReminderObject(
      arrayOfClassObjects,
      activityName,
      endDate,
      startDate,
      description,
      color
    );
  }

  function createAsanaQuarterlyReminder(
    arrayOfClassObjects,
    activityName = "",
    description = "",
    color = "",
    offsetInWeeks = 0
  ) {
    // Get the first monday of the Quater
    arrayOfClassObjects.sort((class1, class2) => {
      return (
        new Date(class1.original_start_date) -
        new Date(class2.original_start_date)
      );
    });

    // Get the earliest class start date
    let startDate = new Date(arrayOfClassObjects[0].original_start_date);
    let endDate = new Date(arrayOfClassObjects[0].original_start_date);

    // Month array by quarter
    let month = [0, 3, 6, 9];

    // Set the start dates month to the first month of the quarter
    startDate.setMonth(month[startDate.getQuarter()]);
    // Set the date to the 1st of the month
    startDate.setDate(1);

    // // Get the day of the week. 0-6
    // let dayOfWeek = startDate.getDay();
    // // Receprocal date, if Mon is 1st then 8th is Mon
    // dayOfWeek = 8 - dayOfWeek;
    // // If the day of the week is 7, set it to 0, no need to progress by a week
    // dayOfWeek = (dayOfWeek === 7)?0:dayOfWeek;
    // // Set the date by Day of week +1 as dates are 1-31 and dont' start from 0.
    // startDate.setDate(dayOfWeek + 1);

    // Get the day of the week. 0-6
    let dayOfWeek = startDate.getDay();
    // If day of week is Saturday or Sunday
    if (dayOfWeek === 0) {
      //Sunday progress by 1
      dayOfWeek = 2;
    } else if (dayOfWeek === 6) {
      // Saturday progress by 2
      dayOfWeek = 3;
    } else {
      // If not a weekend then set it to the first of the month
      dayOfWeek = 1;
    }
    // Set new start date
    startDate.setDate(dayOfWeek);

    // Process offset in weeks
    startDate = startDate - offsetInWeeks * (7 * 24 * 60 * 60 * 1000);

    // Convert date object to Asana format MM/DD/YYYY string
    startDate = convertGrimsbyDateFormat(startDate, true);

    // Set the end date of the quarter, go forward first to allow for 31st and 30th and 29th date issues
    endDate.setDate(1);
    if (endDate.getQuarter() === 3) {
      endDate.setFullYear(endDate.getFullYear() + 1, 0, 1);
    } else {
      endDate.setMonth(month[endDate.getQuarter() + 1]);
    }
    // Set the date to the 1st of the month
    endDate.setDate(0);

    // Get the day of the week. 0-6
    dayOfWeek = endDate.getDay();
    // If day of week is Saturday or Sunday
    if (dayOfWeek === 0) {
      //Sunday revert by 2
      dayOfWeek = -2;
    } else if (dayOfWeek === 6) {
      // Saturday progress by 2
      dayOfWeek = -1;
    } else {
      // If not a weekend then set it to the first of the month
      dayOfWeek = 0;
    }
    // Set the new end date of the quarter, go forward first to allow for 31st and 30th and 29th date issues
    endDate.setDate(1);
    if (endDate.getQuarter() === 3) {
      endDate.setFullYear(endDate.getFullYear() + 1, 0, 1);
    } else {
      endDate.setMonth(month[endDate.getQuarter() + 1]);
    }
    endDate.setDate(dayOfWeek);

    // Process offset in weeks
    endDate = endDate - offsetInWeeks * (7 * 24 * 60 * 60 * 1000);

    // Convert date object to Asana format MM/DD/YYYY string
    endDate = convertGrimsbyDateFormat(endDate, true);

    return buildReminderObject(
      arrayOfClassObjects,
      activityName,
      endDate,
      startDate,
      description,
      color
    );
  }

  function buildReminderObject(
    arrayOfClassObjects,
    activityName,
    dueDate,
    startDate = "",
    description,
    color
  ) {
    let reminder = {};

    // Add all keys to each reminder
    Object.keys(arrayOfClassObjects[0]).forEach((key) => {
      reminder[key] = "";
    });

    arrayOfClassObjects.forEach((classObject) => {
      classObject["Subtask of"] = activityName;
      classObject.Description = "";
    });

    reminder["Activity name"] = activityName;
    reminder.Section = "Instructor Led Training";
    reminder.Color = color;
    reminder["Due date"] = dueDate;
    if (startDate.length !== 0) {
      reminder["Start date"] = startDate;
    }
    reminder.Description = description;

    arrayOfClassObjects.unshift(reminder);

    return arrayOfClassObjects;
  }

  function buildClassObjectsFromTable(headers, rows) {
    let headersArray = [];
    let outputObjectArray = [];

    headers.forEach((element) => {
      headersArray.push(element.innerHTML.trim());
    });

    //console.log("HEADERS ARRAY:", headersArray)

    rows.forEach((element) => {
      let cells = element.querySelectorAll("td > div");
      let classObject = {};

      //console.log("ROW:", element);
      //console.log("ROW ITEMS LENGTH:", Object.keys(cells).length);

      cells.forEach((cellElement, i) => {
        let a;
        let innerText = cellElement.innerText;
        innerText = innerText.replace(/^-$/gm, "");
        innerText = innerText.replace(/\n+/gm, ",");

        if (innerText.indexOf(",") > -1) {
          innerText = '"' + innerText + '"';
        }

        //console.log("CELL ELEMENT:", cellElement);
        //console.log("INDEX", i);

        switch (headersArray[i].toLowerCase()) {
          case "activity name":
            a = cellElement.querySelector("a");
            if (a) {
              classObject[headersArray[i]] = a.innerText;
              classObject["Grimsby Link"] = a.href;
            } else {
              classObject[headersArray[i]] = innerText;
              classObject["Grimsby Link"] = "";
            }
            break;
          case "lms locator id":
            a = cellElement.querySelector("a");
            if (a) {
              classObject[headersArray[i]] = a.innerText;
              classObject["Kiku Link"] = a.href;
            } else {
              classObject[headersArray[i]] = innerText;
              classObject["Kiku Link"] = "";
            }
            break;
          case "start date":
            classObject.Description = "";
            classObject.Section = "";
            classObject.Color = "";
            classObject["Subtask of"] = "";
            innerText = innerText.replace(/^"|"$/gm, "");
            classObject[headersArray[i]] = convertGrimsbyDateFormat(
              innerText,
              true
            );
            classObject.original_start_date = innerText;
            break;
          case "end date":
            innerText = innerText.replace(/^"|"$/gm, "");
            classObject["Due date"] = convertGrimsbyDateFormat(innerText, true);
            break;
          default:
            classObject[headersArray[i]] = innerText;
            break;
        }
      });

      outputObjectArray.push(classObject);
    });

    return outputObjectArray;
  }

  function convertGrimsbyDateFormat(dateString, forAsana = false) {
    let oldDateFormat = new Date(dateString);
    let newDateFormat = forAsana
      ? oldDateFormat.toLocaleDateString("en-US")
      : oldDateFormat.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
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

    arrayData.forEach((row) => {
      let rowData = row.join(",");
      csvContent += rowData + "\r\n";
    });

    return csvContent;
  }

  function startDownload(forAsana) {
    //console.log("START DOWNLOAD CLICK");

    let tableData = forAsana ? getTableDataForAsana() : getTableData();
    let csvData = convertToCSV(tableData);

    //console.log("CSV DATA:", csvData);

    let element = document.createElement("a");

    element.setAttribute(
      "href",
      "data:text/plain;charset=utf-8," + encodeURIComponent(csvData)
    );
    element.setAttribute(
      "download",
      `classes_${formatDateforFileName(new Date())}.csv`
    );
    element.style.display = "none";

    if (typeof element.download != "undefined") {
      //browser has support - process the download
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } else {
      //browser does not support - alert the user
      alert(
        "This functionality is not supported by the current browser, recommend trying with Google Chrome instead.  (http://caniuse.com/#feat=download)"
      );
    }
  }

  function appendDownloadButton(buttonGroup, forAsana) {
    // let saveFiltersButton = await waitForElement(document, '[data-testid="ActivityListActionsSaveFilters"]');
    let button = document.createElement("awsui-button");
    let buttonInner = document.createElement("button");
    let span = document.createElement("span");

    span.innerHTML = forAsana ? "Download CSV (ASANA)" : "Download CSV";
    span.setAttribute("awsui-button-region", "text");

    buttonInner.append(span);
    buttonInner.classList.add(
      "awsui-button",
      "awsui-button-variant-primary",
      "awsui-hover-child-icons"
    );
    buttonInner.addEventListener("click", () => {
      startDownload(forAsana);
    });

    button.append(buttonInner);

    //saveFiltersButton.parentNode.insertBefore(button, saveFiltersButton);
    buttonGroup.append(button);
  }

  Date.prototype.getWeek = function () {
    let onejan = new Date(this.getFullYear(), 0, 1);
    let milisecsInDay = 86400000;
    return Math.ceil(
      ((this - onejan) / milisecsInDay + onejan.getDay() + 1) / 7
    );
  };

  Date.prototype.getQuarter = function () {
    let quarter = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3];
    return quarter[this.getMonth()];
  };

  Date.prototype.getMonthName = function (longFormat = true) {
    let num = this.getMonth();

    let longMonth = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    let shortMonth = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    return longFormat ? longMonth[num] : shortMonth[num];
  };

  Date.getMonthName = function (longFormat = true, num) {
    num = Number(num);
    if (isNaN(num)) {
      return "Not a number";
    }
    if (num < 0 || num > 11) {
      return "Out of range";
    }

    let longMonth = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    let shortMonth = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    return longFormat ? longMonth[num] : shortMonth[num];
  };

  window.addEventListener(
    "load",
    async () => {
      //console.log("WINDOW LOADED");

      //TODO WHEN ONLINE
      let buttonGroup = await waitForElement(
        document,
        ".awsui-util-action-stripe-group"
      );

      //TODO OFF LINE
      // let buttonGroup = document.querySelector(".awsui-util-action-stripe-group");

      appendDownloadButton(buttonGroup, true);
      appendDownloadButton(buttonGroup, false);
    },
    false
  );
})();
