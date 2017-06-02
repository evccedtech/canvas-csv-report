# canvas-csv-report
Create simple CSV reports from Canvas on the command line.

## Installation
You'll first need to install [Node.js](https://nodejs.org/) if you don't already have it. 

Next, clone this repository.

Finally, from within the directory where you cloned the repository, issue the following command on the command line:
`npm install`. This will install necessary dependencies in a `node_modules` directory.

After a little configuration (see below), you'll be able to create basic CSV Canvas reports from the command line.

## Required Configuration
Before you can generate any reports, you'll need to add some information to the `config.json` file.

### Top-level account ID
Replace the text that reads "YOUR TOP-LEVEL CANVAS ACCOUNT ID" with exactly what it says -- the Canvas id for your top-level account.

### Instance URL
Replace the text that reads "YOUR CANVAS INSTANCE URL" with the URL you use to access your institution's Canvas instance (for example, `https://mycollege.instructure.com`).

### API token
Replace the text that reads "YOUR CANVAS API TOKEN" with your own Canvas API token. This token must be from an account with Canvas admin privileges. If you don't have a Canvas API token, consult the Canvas documentation to find out how to create one.

### Institution name or acronym
Replace the text that reads "YOUR INSTITUTION'S NAME OR ACRONYM" with the name or abbreviation for your college (e.g. `EvCC` or `Everett Community College`). Depending on other settings and how your Canvas instance is configured, this text may appear in some reports.

## Optional Configuration
There are a few other options you can configure in addition to the required ones listed above. 

### Report directory
By default, all reports will be written to a `reports` directory within the directory where the report script lives, but you can change this to another location you want by changing the value of the `dir` property.

### Date stamp
The `datestamp` property allows you to indicate whether you wish the current date to be appended to the file name for each report. This is sometimes useful if you wish to differentiate among reports run on multiple days.

### Minimum enrollment
It is often useful to apply a minimum enrollment filter in order to exclude low-enrollment courses from reports. Courses that have fewer students than the enrollment minimum, specified by the `enrollmentMin` property, will not be counted. The default value is 3, meaning that courses with 2 or fewer students will be excluded. 

If you wish to include all courses, set `enrollmentMin` to 0.

### Course navigation
Optionally, you can add one or more course navigation tabs to report on. This is accomplished by adding the names of the navigation tabs (the text *exactly* as it appears in the menu Canvas) to the `tabs` array. Values should be enclosed in quotes and separated by commas.

For example, if you want to report on the number of courses that have the People and Grades tabs enabled in the course navigation, you would update the `tabs` field like so:

`"tabs": ["People", "Grades"]`

## Creating Reports
After you're done with the configuration, you can generate a set of reports by issuing the following command from the directory where `report.js` is located:

`node report [TERM]`

where TERM is a representation of the academic quarter you want to report on. This consists of a quarter abbreviation (W = Winter, S = Spring, SU = Summer, F = Fall) and a two-digit year. For example, Winter 2017 would be represented as 'W17', Summer 2015 as 'SU15', and so on.

Because a report potentially makes a very large number of calls to the Canvas API (depending on the number of courses in the specified academic term), it can take several minutes to generate a report. The report script will periodically provide an approximation of the time remaining.

### Sub-accounts
The first time you run the report script, it will save information about sub-accounts in your Canvas instance to a file named `accounts.json` in the same directory where the report script is located. Subsequent reports will use this file, rather than make a new API request for sub-account information. If your Canvas sub-account structure changes (if you add or remove a sub-account, for example), you should delete this file so that it will be regenerated with the updated account structure the next time you run the script.

There are lots of different ways that Canvas sub-accounts are used by different institutions, so it's important to recognize that it may not work for your particular circumstances (though the course-level reports should typically work regardless of sub-account structure). 

If your institution uses a single sub-account level (that is, you have a top-level account and then a single level of sub-accounts within it), you'll probably get the best results if you set the `subaccountRecursion` property in the `config.json` file to `false`. The result will be that you'll get just two reports when you run the script: one that lists all courses individually, and another that tallies up the courses within each sub-account.

If your institution uses two levels of nested sub-accounts (that is, you have a top-level account, sub-accounts, and then another level of sub-accounts within those), changing the `subaccountRecursion` property to `true` (which is the default) will allow you to create three different reports: a course-level report, a sub-account report, and an institutional report that rolls up everything into the highest level sub-accounts only.

If you change the `subaccountRecursion` property, be sure to delete the `accounts.json` file in the script directory before you create more reports.

### Reports
Reports are saved as standard CSV files that you can open in import into Excel, Google Sheets, or many other data analysis tools.

#### Course-level report
This report lists every course for the selected quarter. It contains the following fields by default:
- *account_id*: the Canvas id of the sub-account to which the course belongs
- *account_name*: the name of the sub-account to which the course belongs (Note: courses that aren't in a sub-account will show the institution's name instead)
- *term*: the term abbreviation (e.g. 'S13', 'W14')
- *id*: the Canvas course id
- *course_code*: the short name associated with the course
- *name*: the full name of the course
- *enrollment*: the number of students enrolled in the course (Note: enrollment figures provided by Canvas may differ from an institution's official enrollment information for a course -- for example, if students have been added/removed manually)
- *published*: 1 if the course has been published, 0 if it is unpublished
- *homepage*: 1 if the course has set a wiki page as the home page, 0 if not
- *syllabus*: 1 if the course syllabus page has content other than the assignment information Canvas automatically displays, 0 if not

If navigation tabs have been specified in the `config.json` file, corresponding fields will be included as well. For all navigation tabs a value of 1 indicates that the tab is active in the course, while a value of 0 indicates it not.

### Sub-account report
This report lists aggregated information about the courses in each sub-account. It contains the following fields by default:
- *term*: the term abbreviation (e.g. 'S13, 'W14')
- *account_id*: the Canvas id of the sub-account
- *account_name*: the name of the sub-account (Note: courses that aren't in a sub-account will show the institution's name instead)
- *course_count*: the total number of courses in the sub-account
- *course_count_enrollment_min*: the number of courses in the sub-account where enrollment is greater than or equal to the value assigned to the `enrollmentMin` property in the `config.json` file. By default this number is 3, meaning that only courses with 3 or more students will be counted here
- *enrollment*: the combined enrollment for all the courses in this sub-account 
- *published*: the number of courses above the enrollment minimum that have been published
- *published_pct*: the percent of courses above the enrollment minimum that have been published
- *homepage*: the number of published that have set a wiki page as the home page
- *homepage_pct*: the percent of published courses that have set a home page
- *syllabus*: the number of published courses that have syllabus page content other than the automatica assignment information
- *syllabus_pct*: the percent of published courses that have syllabus page content

If navigation tabs have been specified, corresponding fields will be included as well. Like the homepage and syllabus fields described above, these will indicate the total number and percent of published courses in a sub-account that have enabled the tab in question.

### Institution report
This report lists aggregated information about the courses in each first-level sub-account for an institution (that is, the sub-accounts that are the immediate children of the institution's Canvas account). This report is only created when the `subaccountRecursion` option is set to `true` and there are multiple levels of nested sub-accounts at the institution. The fields included in this report are the same as those included in the sub-account report described above.
