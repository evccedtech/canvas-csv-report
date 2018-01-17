// Require packages and config file
var _ = require('underscore');
var collection = require('d3-collection');
var config = require('./config.json');
var csv = require('babyparse');
var fs = require('fs');
var request = require('request');

var accounts = [];
var courses = [];
var requestSequence = ['termId', 'courses'];
var term = null;
var termId = null;
var timestamp = '';
var verbose = false;
var year = null;

// Command-line arguments
var cliArgs = process.argv.slice(2);

if (config.report.datestamp) {
    
    timestamp = '_' + getTimestamp();
    
}

/**
 * @function canvasApiRequest
 * Makes an API call and executes an optional callback on success.
 * @param {string} url - the URL for the HTTP request
 * @param {function} callback - the callback function 
 */
function canvasApiRequest(url, callback) {
    
    var args;
    var isComplete = false;
    var next = null;
    var options = {
        url: url,
        headers: {
            'Authorization': 'Bearer ' + config.canvas.token
        }
    };

    request(options, function(error, response, body) {
        
        if (error) {
            throw(error);
        }
        
        // Note -- Canvas API sometimes throttles requests if 
        // if the quota has been exceeded, and the statusCode will be 403
        // in these cases.
        if (response.statusCode === 200) {
            
            // Handle result pagination...
            next = getNextLink(response.headers.link);
            
            if (next !== null) {
                canvasApiRequest(next, callback);
            } else {                
                isComplete = true;
            }
            
            if (callback && typeof callback === 'function') {
                
                args = {
                    body: JSON.parse(body),
                    response: response,
                    isComplete: isComplete
                };
                
                callback.call(undefined, args);
                
            }
            
        } else if (response.statusCode === 403) {
            writeMessage('WARNING:\nCanvas API throttling may be occurring: ' + response.headers['x-rate-limit-remaining']);
        }
        
    });
    
}


/**
 * @function checkArgs
 * Checks for required term.
 * @param {object} cliArgs - arguments passed from the command line.
 */
function checkArgs(cliArgs) {
    
    if (cliArgs.length < 1) {
        
        writeMessage('You must specify an academic quarter (i.e. "F16", "SU14", "W15")');
        
        return false;
    
    } else if (cliArgs.length === 1) {
        
        if (/^[FSWUu]{1,2}[0-9]{2}/.test(cliArgs[0])) {
            
            term = cliArgs[0];
            
        } else {
            
            writeMessage('Invalid academic quarter specified -- try something like "F16", "SU14" or "W15".');
            
            return false;
            
        }
        
    } else {
        
        if (cliArgs[1] === '--verbose' && /^[FSWUu]{1,2}[0-9]{2}/.test(cliArgs[0])) {
        
            verbose = true;
            term = cliArgs[0];
            
        } else {
            
            writeMessage('Whoa! Something is wrong with the supplied arguments. Check the documentation and try again.');
        
        }
        
    }
        
}

/**
 * @function countByInstitution
 * Creates an institutional rollup for subaccounts. 
 * @param {object} courses - the collection of course objects to act on
 * @returns {object} - the top-level subaccount information for the institution
 */
function countByInstitution(courses) {
    
    var nest = collection.nest()
        .key(function(d) { return d.parent_account_id; })
        .entries(accounts);
    
    var output = [];
        
    var subAccountNest = _.reject(nest, function(val) {
        return val.key === config.canvas.account;
    });
    
    _.each(subAccountNest, function(sub) {  // equivalent to division
        
        var rollup = {
            term: term,
            account_id: sub.key,
            account_name: getAccountName(parseInt(sub.key)),
            course_count: 0,
            course_count_enrollment_min: 0
        };
        
        _.each(sub.values, function(subsub) {
            
            var subsubCourses = _.where(courses, {account_id: subsub.id});
            
            rollup.course_count += subsubCourses.length;
            
            rollup.course_count_enrollment_min += _.filter(subsubCourses, function(val) {
                return val.enrollment >= config.report.enrollmentMin;
             }).length;
             
             for (var i = 0, len = subsubCourses.length; i < len; i++) {
                 
                if (subsubCourses[i].enrollment && subsubCourses[i].enrollment >= config.report.enrollmentMin) {
                    
                    if (rollup.published) {
                        rollup.published += subsubCourses[i].published;
                    } else {
                        rollup.published = subsubCourses[i].published;
                    }
                    
                }
                 
             }
            
        });
        
        _.each(sub.values, function(subsub) {  // equivalent to department/program
           
            var subsubCourses = _.where(courses, {account_id: subsub.id});
            
            rollup.course_count += subsubCourses.length;
            
            rollup.course_count_enrollment_min += _.filter(subsubCourses, function(val) {
                return val.enrollment >= config.report.enrollmentMin;
             }).length;
             
            
            for (var i = 0, len = subsubCourses.length; i < len; i++) {
                
                _.each(config.report.options, function(option) {
                    
                    var pctLabel = option + '_pct';
                    
                    if (subsubCourses[i].enrollment && subsubCourses[i].enrollment >= config.report.enrollmentMin) {
                        
                        if (rollup[option]) {
                            
                            rollup[option] += subsubCourses[i][option];
                            
                        } else {
                            
                            rollup[option] = subsubCourses[i][option];
                            
                        }
                        
                    }
                    
                    if (option === 'published' || option === 'homepage' || option === 'syllabus') {
                        
                        if (rollup[option] === 0) {
                            
                            rollup[pctLabel] = 0;
                            
                        } else {
                            
                            if (option === 'published') {
                                rollup[pctLabel] = getPercent(rollup[option], rollup.course_count_enrollment_min);
                            } else {
                                rollup[pctLabel] = getPercent(rollup[option], rollup.published);
                            }
                            
                        }
                        
                    }
                    
                });
                
                _.each(config.report.tabs, function(tab) {
                    
                var label = getTabLabel(tab);
                var pctLabel = label + '_pct';
                
                
                if (subsubCourses[i].enrollment && subsubCourses[i].enrollment >= config.report.enrollmentMin) {
                    
                    if (rollup[label]) {
                        
                        rollup[label] += subsubCourses[i][label];
                        
                    } else {
                        
                        rollup[label] = subsubCourses[i][label];
                        
                    }
                    
                    if (rollup[label] === 0) {
                        
                        rollup[pctLabel] = 0;
                        
                    } else {
                        
                        rollup[pctLabel] = getPercent(rollup[label], rollup.published);
                        
                    }
                    
                }
                    
                });
                
            }
            
        });
        
        // Only add subaccount rollups if there is at least one course...    
        if (rollup.course_count > 0) {
    
            output.push(rollup);
    
        }
        
    });
    
    return output;
    
}

/**
 * @function countBySubAccount
 * Creates a sub-account rollup for courses. 
 * @param {object} courses - the collection of course objects to act on
 * @returns {object} - the sub-account sorted course information
 */ 
function countBySubaccount(courses) {
    
    var accountNest = collection.nest()
        .key(function(d) { return d.account_id; })
        .entries(courses);
        
    var output = [];
    
    _.each(accountNest, function(subaccount) {
        
        var rollup = {
            term: term,
            account_id: subaccount.key,
            account_name: getAccountName(parseInt(subaccount.key)),
            course_count: subaccount.values.length,
            course_count_enrollment_min: _.filter(subaccount.values, function(val) {
                    return val.enrollment >= config.report.enrollmentMin;
                }).length,
            course_count_published: _.filter(
                _.filter(subaccount.values, function(val) {
                    return val.enrollment >= config.report.enrollmentMin;
                }), function(val) {
                return val.published > 0;
            }).length,
        };
        
        _.each(config.report.options, function(option) {
            
            var pctLabel = option + '_pct';
            
            rollup[option] = 0;
            
            for (var i = 0, len = subaccount.values.length; i < len; i++) {
                
                if (subaccount.values[i].enrollment && subaccount.values[i].enrollment >= config.report.enrollmentMin && subaccount.values[i].published > 0) {
                    
                    rollup[option] += subaccount.values[i][option];
                    
                } 
                
            }
            
            if (rollup[option] > 0) {
                
                if (option === 'published') {
                    
                    rollup[pctLabel] = getPercent(rollup.published, rollup.course_count_enrollment_min);
                    
                } else if (option !== 'enrollment') {
                    
                    rollup[pctLabel] = getPercent(rollup[option], rollup.course_count_published);
                    
                }
                
            } else if (rollup[option] === 0 && option === 'published') {
                
                rollup[pctLabel] = 0;
                
            }
            
        });
        
        _.each(config.report.tabs, function(tab) {
           
           var label = getTabLabel(tab);
           var pctLabel = label + '_pct';
           
           rollup[label] = 0;
           
           for (var i = 0, len = subaccount.values.length; i < len; i++) {
                
                if (subaccount.values[i].enrollment && subaccount.values[i].enrollment >= config.report.enrollmentMin && subaccount.values[i].published > 0) {
                    
                    rollup[label] += subaccount.values[i][label];
                    
                } 
                
            }
            
            if (rollup[label] > 0) {
                
                rollup[pctLabel] = getPercent(rollup[label], rollup.course_count_published);
                
            }
            
            
        });
    
        // Only add subaccount rollups if there is at least one course...    
        if (rollup.course_count > 0) {
    
            output.push(rollup);
    
        }
        
    });
    
    return output;
    
}


/**
 * @function createReport
 * Writes a CSV report to the file system.
 * @param {object} courses - the collection of course objects to convert to CSV
 */
function createReport(courses) {
    
    _.each(config.report.output, function(type) {
        
        var outfile = config.report.dir + type + '_report_' + term + timestamp + '.csv';
        var unparsed = csv.unparse({
            fields: setCsvFields(type), 
            data: processData(type, courses)
        });
        
        if (type === 'institution' && !config.canvas.subaccountRecursion) {
            return false;
        }
        
        writeMessage("\nPreparing " + type + " report....\n");
        
        if (!fs.existsSync(config.report.dir)) {
            fs.mkdirSync(config.report.dir);
        }
        
        writeReport(outfile, unparsed);
        
        writeMessage('  ' + term + ' report written to file: ' + outfile + '\n');
        
    });
    
}


/**
 * @function getAccountList
 * Retrieves recursive list of Canvas accounts and sub-accounts.
 * @param {string} url - the request URL
 * @param {function} callback - an optional callback
 */
function getAccountList(url, callback) {
    
    canvasApiRequest(url, function(args) {
        
        args.body.forEach(function(result) {
            
            accounts.push({
                "name": result.name,
                "id": result.id,
                "parent_account_id": result.parent_account_id,
                "sis_account_id": result.sis_account_id,
                "workflow_state": result.workflow_state
            });
            
        });
        
        fs.writeFileSync('./accounts.json', JSON.stringify(accounts));
        
        if (callback && typeof callback === 'function') {
            callback.call(undefined, args);
        }
        
    });
    
}


/**
 * @function getAccountName
 * Provides the name that corresponds to a subaccount ID.
 * @param {number} id - the subaccount identifier
 * @returns {string} - the subaccount name
 */
function getAccountName(id) {
    
    var accountInfo = _.where(accounts, {id: id});
    
    if (accountInfo.length > 0) {
        return accountInfo[0].name;
    } else {
        return config.institution;
    } 
    
}


/**
 * @function getCourseDetails
 * Fetches additional course details, based on report options
 * specified in config.json, and adds them to each course object.
 */
function getCourseDetails() {
    
    var throttled = _.throttle(getTimeRemaining, 60000, {trailing: false});
    
    writeMessage('\nFetching course details...');
    
    if (!_.contains(config.report.options, "homepage") && !_.contains(config.report.options, "syllabus") && !_.contains(config.report.options, "enrollment") && config.report.tabs.length === 0) {

        writeMessage("\n  No options require additional course details.");
        
        createReport(courses);
        
        return false;
    }
    
    _.each(courses, function(course, idx) {
        
        var url = getEndpoint('course').replace(/:course_id/, course.id);
        
        // Timeout to avoid hitting the rate limit for successive Canvas API calls
        var timeout = setTimeout(function() {

            throttled.call(undefined, idx);
                                    
            canvasApiRequest(url, function(args) {

                if (args.isComplete) {
                    
                    // Act on each report option
                    _.each(config.report.options, function(option) {
                        
                        if (option === 'syllabus') {
                            
                            if (args.body.syllabus_body !== null && args.body.syllabus_body.length > 0) {
                                courses[idx].syllabus = 1;
                            } else {
                                courses[idx].syllabus = 0;
                            }
                        }
                        
                        if (option === 'enrollment') {
                            courses[idx].enrollment = args.body.total_students;
                        }
                        
                    });
                    
                    _.each(config.report.tabs, function(tab) {
                        
                        var label = getTabLabel(tab);
                        var tab = _.where(args.body.tabs, {label: tab});
                        
                        courses[idx][label] = 0;
                        
                        if (tab.length > 0) {
                            if (tab[0].visibility === 'public' && !tab[0].hasOwnProperty('hidden')) {
                                courses[idx][label] = 1;
                            }
                        }
                        
                    });
                    
                }
                
                if (idx === courses.length - 1) {
                    
                    writeMessage("\n  Done.\n");
                    
                    // A hack, but without it occasionally the final 
                    // course details don't make it into the report
                    _.delay(function() {

                        createReport(courses);

                    }, 1000);
                }

            });
            
        }, 
        
        // requestInterval defaults to 100ms, which may be unnecessarily long.
        // Value can be modified in config.json.
        config.requestInterval * idx);
        
    });
    
}


/**
 * @function getCourseList
 * Retrieves list of courses in a Canvas account or sub-account
 * @param {string} url - the request URL
 * @param {function} callback - an optional callback
 */
function getCourseList(url, callback) {
    
    canvasApiRequest(url, function(args) {
        
        args.body.forEach(function(result) {
            
            var courseObj = {
                id: result.id,
                account_id: result.account_id,
                account_name: getAccountName(result.account_id),
                name: result.name,
                course_code: result.course_code,
                term: term
            };
            
            
            if (_.contains(config.report.options, 'published')) {
                if (result.workflow_state === 'available') {
                    courseObj.published = 1;
                } else {
                    courseObj.published = 0;
                }
            }
            
            if (_.contains(config.report.options, 'homepage')) {
                if (result.default_view === 'wiki') {
                    courseObj.homepage = 1;
                } else {
                    courseObj.homepage = 0;
                }
            }

            courses.push(courseObj); 
            
            if (verbose) {
                writeMessage('\n getCourseList --> ' + JSON.stringify(courseObj));
            }
            
        });
        
        if (callback && typeof callback === 'function') {
            callback.call(undefined, args);
        }
        
    });
    
}


/**
 * @function getEndpoint
 * Composes a Canvas API endpoint.
 * @param {string} type - the type of API call
 * @returns {string} - a URL
 */
function getEndpoint(type) {
    
    var account = config.canvas.account;
    var endpoint = config.canvas.instance;
    
    switch(type) {
        
        case 'accounts':
            endpoint += '/api/v1/accounts/' + account + '/sub_accounts?per_page=' + config.canvas.perPage;
            
            if (config.canvas.subaccountRecursion) {
                endpoint += '&recursive=true';
            }
            
            break;
        
        case 'courses':
            endpoint += '/api/v1/accounts/' + account + '/courses?per_page=' + config.canvas.perPage + '&enrollment_term_id=' + termId;
            break;
            
        case 'course':
            endpoint += '/api/v1/courses/:course_id?per_page=' + config.canvas.perPage;
            
            if (_.contains(config.report.options, 'syllabus')) {
                endpoint += '&include[]=syllabus_body';
            }
            
            if (_.contains(config.report.options, 'enrollment')) {
                endpoint += '&include[]=total_students';
            }
            
            if (config.report.tabs.length > 0) {
                endpoint += '&include[]=tabs';
            }
            
            break;
            
        case 'termId':
            endpoint += '/api/v1/accounts/' + account + '/terms?per_page=' + config.canvas.perPage;
            break;
               
    }
    
    return endpoint;
    
}


/**
 * @function getNextLink
 * Checks to see if there are more pages of results, or
 * if we've fetched the last page.
 * @param {string} links - the links returned in the response header
 * @returns {string|object} - the next page link...or null if the last page has been reached 
 */
function getNextLink(links) {

        var expr = /https:\/\/[A-Za-z0-9]*\.[-A-Za-z0-9:%_\+~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-A-Za-z0-9:%_\+.~#?&//=]*)?/gi;
        var current;
        var last;
        var next;
        var regex = new RegExp(expr);
        var url;

        if (typeof links === 'string') {
            links = links.split(/,/g);
        }
        
        next = _.filter(links, function(link) { return /rel="next"/.test(link); });
        last = _.filter(links, function(link) { return /rel="last"/.test(link); });
        current = _.filter(links, function(link) { return /rel="current"/.test(link); });

        if (next.length > 0) {
            return next[0].match(regex)[0];
        } else {
            return null;
        }

}


/*
 * @function getPercent
 * Calculates a percentage with the significant figures specified in config file
 * @param {number} num - numerator
 * @param {number} denom - denominator
 * @returns {number|string} percent - the calculated percentage
 */
function getPercent(num, denom) {
    
    var percent;
    
    if (denom === 0) {
        
        percent = '';
        
    } else {
            
        percent = (num / denom).toPrecision(config.report.pctPrecision);
        
    }
    
    return percent;
    
}


/*
 * @function getTabLabel
 * Returns a label to be used for reporting on the use navigation tabs
 * @param {string} tab - the name of the tab specified in the config file
 * @returns {string} label - the label to be used in the CSV file
 */
function getTabLabel(tab) {
    
    var label = tab.toLowerCase().replace(/\s/g, '_');
    
    return label;
    
}


/**
 * @function getTermId
 * Requests the Canvas id for the specificied term
 * @param {function} callback - an optional callback
 */
function getTermId(callback) {
    
    canvasApiRequest(getEndpoint('termId'), function(args) {
       
        var selectedTerm = _.where(args.body.enrollment_terms, { sis_term_id: term });
        
        if (typeof selectedTerm === 'object' && selectedTerm.length > 0) {
            termId = selectedTerm[0].id;
        }
    
        if (callback && typeof callback === 'function') {    
            callback.call(undefined, args);
        }
        
    });
    
}


/*
 * @function getTimeRemaining
 * Provides a rough estimate of how much time is remaining
 * before reports are created.
 * @param {number} idx - the index of the course currently being processed
 */
function getTimeRemaining(idx) {
    
    var timeRemaining = Math.round(Math.ceil(courses.length - idx) * config.requestInterval / 1000);
    var message;

    if (timeRemaining > 60) {
        message =  '\n  ' + Math.round(timeRemaining / 60) + ' minute(s) remaining...';
    } else {
        message = '\n  Less than 1 minute remaining...';
    }
    
    if (timeRemaining >= 10) {
        writeMessage(message);   
    }
    
}


/**
 * @function getTimestamp
 * @returns {string} - a timestamp
 */
function getTimestamp() {
    
    var date = new Date;
    var day;
    var month;
    var year;
    var output = '';
    
    year = date.getFullYear();
    
    month = date.getMonth() + 1;
    
    day = date.getDate();
    
    if (month < 10) {
        month = '0' + month.toString();
    }
    
    if (day < 10) {
        day = '0' + day.toString();
    }
    
    return year + '-' + month + '-' + day;
    
}

/**
 * @function init
 * Initializes report process.
 */
function init() {
    
    // If term has been set
    if (term !== null) {
      
        // No local account list exists, so we need to create one
        if (!fs.existsSync('./accounts.json')) {
            
            writeMessage("\nCreating sub-account list");
            
            getAccountList(getEndpoint('accounts'), function(args) {
                
                if (args.isComplete) {
                    
                    writeMessage("\n  Sub-account list created and saved to ./accounts.json.\n");

                    init();
                    
                }
                
            });
            
        } else {
            
            // Account list already exists, so we just need to require it
            accounts = require('./accounts.json');
            
            getTermId(function() {
                
                writeMessage('\nFetching course list for ' + term + '...');
                
                getCourseList(getEndpoint('courses'), function(args) {
                    
                    if (args.isComplete) {
                        
                        writeMessage('\n  Done.\n');
                        
                        if (args.isComplete) {
                            
                            getCourseDetails();
                            
                        }
                    }
                    
                });
                
            });
            
        }
        
    } else {
        
        // This should set the term based on user input
        checkArgs(cliArgs);
        
        init();
        
    }
    
}


/**
 * @function processData
 * Returns courses after being processed and sorted.
 * @param {string} type - the type of report
 * @param {object} courses - the collection of course objects to act on
 */
function processData(type, courses) {
    
    if (type === 'courses') {
        
        return _.sortBy(courses, 'account_name');
        
    } else if (type === 'subaccounts') {
        
        return _.sortBy(countBySubaccount(courses), 'account_name');
        
    } else if (type === 'institution') {
        
        return _.sortBy(countByInstitution(courses), 'account_name');
        
    }

}


/**
 * @function setCsvFields
 * Creates array of headers to use in CSV output based on report type
 * @param {string} type - the type of report that will be created
 * @returns {object} - the array of header names
 */
function setCsvFields(type) {
    
    var fields = [];
    
    if (type === 'courses') {
        
        fields.push('account_id', 'account_name', 'term', 'id',  'course_code', 'name');
    
    } else if (type === 'subaccounts' || type === 'institution') {
        
        fields.push('term', 'account_id', 'account_name', 'course_count', 'course_count_enrollment_min');
        
    } 
    
    _.each(config.report.options, function(option) {
        
        var pctLabel = option + '_pct';
        
        fields.push(option);
        
        if (type !== 'courses') {
         
            if (option !== 'enrollment') {
                fields.push(pctLabel);
            }
            
        }
        
    });
    
    _.each(config.report.tabs, function(option) {
        
        var label = getTabLabel(option);
        var pctLabel = label + '_pct';
        
        fields.push(label);
        
        if (type !== 'courses') {
            fields.push(pctLabel);
        }
        
    });

    
    return fields;
    
}


/**
 * @function writeMessage
 * Writes a message to stdout.
 * @param {string} msg - The string to write to stdout
 */
function writeMessage(msg) {
    
    process.stdout.write(msg, encoding='utf-8');
    
}


/**
 * @function writeReport
 * Writes the report to the file system
 * @param {string} file - the file path
 * @param {object} - the data to write to the file
 */
function writeReport(file, data) {
    
    fs.writeFile(file, data, 'utf8', function(error) {
       
       if (error) {
           console.log("DEBUG --> ", error);
           throw(error);
       }
        
    });
    
}



// Do report stuff...

init();
