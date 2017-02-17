# canvas-csv-report
Create simple CSV reports from Canvas on the command line

## Installation
You'll first need to install [Node.js](https://nodejs.org/) if you don't already have it. 

Next, clone this repository.

Finally, from within the directory where you cloned the repository, issue the following command on the command line:
`npm install`

This will install necessary dependencies in a `node_modules` directory.

After a little configuration (see below), you'll be able to create basic CSV Canvas reports from the command line.

## Configuration
In the directory where you have cloned the repository, there should be two files that you'll need to update before running a report for the first time, `config.json` and `departments.json`.

### `config.json`
In `config.json`, you'll need to update several fields.

#### Account
Replace the text that reads "CANVAS ID FOR YOUR TOP-LEVEL ACCOUNT" with exactly what it says -- the Canvas id for your top-level account.

#### Instance
Replace the text that reads "YOUR CANVAS INSTANCE URL" with the URL you use to access your institution's Canvas instance (for example, `https://mycollege.instructure.com`).

#### API token
Replace the text that reads "YOUR SUPER-SECRET API TOKEN" with your own Canvas API token. This token should be from an account with Canvas admin privileges. If you don't have a Canvas API token, consult the Canvas documentation to find out how to create one.

#### Report Types
The `reportTypes` field lists the types of reports that will be generated. By default, three separate CSV files will be created: one that lists all courses for the selected term, one that lists all departments for the selected term, and one that lists all divisions for the selected term. If you don't need a particular report type, you can remove it from the list.

#### Report Folder
This is the directory that the reports will be written to. By default, it will write reports to a `reports` sub-directory, but you can change this to whatever you want. The path is relative to the report script. 

#### Report Options
By default, the report will include information on the number of courses that are published, have set a custom home page, and have added text to the syllabus page. It will also include the number of students enrolled in each class.

If you don't want one of these included in the reports, simply delete the corresponding option listed in the reportOptions field.

#### Course Navigation
Optionally, you can add one or more course navigation tabs to report on. Do so by adding the tab's text label (the text exactly as it appears in the menu Canvas). For example, if you want to report on the number of courses that have Blackboard Collaborate enabled in the course navigation, you would update the `reportTabs` field like so:
`"reportTabs": ["Blackboard Collaborate"]`

### `departments.json`
This file contains a JSON representation of all the departments and divisions you wish to include in the report(s). You will need to update this for your institution. A blank template of this file is included in the repository.

#### id
The unique Canvas id corresponding to the department or division sub-account.

#### code
The alphanumeric code or abbreviation for the department or division

#### division
(For departments) This is the code for the division to which the department belongs

## Use
After you're done with the configuration, you can generate a set of reports by issuing the following command from the directory where `report.js` is located:

`node report [TERM]`

where TERM is a representation of the academic quarter you want to report on. This consists of a quarter abbreviation (W = Winter, S = Spring, SU = Summer, F = Fall) and a two-digit year. For example, Winter 2017 would be represented as 'W17'
