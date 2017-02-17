// Require packages and config file
var _ = require('underscore');
var collection = require('d3-collection');
var config = require('./config.json');
var csv = require('babyparse');
var depts = require('./departments.json');
var request = require('request');
var fs = require('fs');

var courses = [];
var requestSequence = ['termId', 'courses'];
var reportTerm;
var term = null;
var termId = null;
var year = null;

// Command-line arguments
var cliArgs = process.argv.slice(2);


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
        
        writeMessage('Whoa! Only one argument required: an academic quarter (i.e. "F16", "SU14", "W15")');
    }
    
    
}


/**
 * @function countByDept
 * Creates a department-level rollup for courses
 * @param {object} courses - the collection of course objects to act on
 * @returns {object} - the department-level course information
 */
function countByDept(courses) {
    
    var deptNest = collection.nest()
        .key(function(d) { return d.division; })
		.key(function(d) { return d.program; })
		.entries(courses);

    var output = [];
		
	_.each(deptNest, function(division) {
    	
    	_.each(division.values, function(dept) {
        	
        	var rollup = {
            	term: term,
            	division: division.key,
            	program: dept.key,
            	course_count: dept.values.length
        	};
        	
        	for (var i = 0, len = dept.values.length; i < len; i++) {
            	
            	_.each(config.reportOptions, function(option) {
                	
                	var pctLabel = option + '_pct';
                	
                	if (rollup[option]) {
                    	
                        rollup[option] += dept.values[i][option];
                    	
                	} else {
                    	
                    	rollup[option] = dept.values[i][option];
                    	
                	}
                	
                	if (option === 'published' || option === 'homepage' || option === 'syllabus') {
                    	
                    	if (rollup[option] === 0) {
                        	
                        	rollup[pctLabel] = 0;
                        	
                    	} else {
                    	
                        	rollup[pctLabel] = getPercent(rollup[option],  rollup.course_count);
                        }
                    	
                	}
                	
            	});
            	
            	_.each(config.reportTabs, function(option) {
                	
                	var label = getTabLabel(option);
                	var pctLabel = label + '_pct';
                	
                	if (rollup[label]) {
                    	
                    	rollup[label] += dept.values[i][label];
                    	
                	} else {
                    	
                    	rollup[label] = dept.values[i][label];
                    	
                	}
                	
                	if (rollup[label] === 0) {

                    	rollup[pctLabel] = 0;

                	} else {
                    	
                    	rollup[pctLabel] = getPercent(rollup[label],  rollup.course_count);
                    	
                	}
                	
            	});
            	
        	}
        	
        	output.push(rollup);
        	
    	});
        
	});
	
	return output;

}


/**
 * @function countByDiv
 * Creates division-level rollup for courses
 * @param {object} courses - the collection of course objects to act on
 * @returns {object} - the division-level course information
 */
function countByDiv(courses) {
    
    // I just like the d3 way of doing this
    var divNest = collection.nest()
        .key(function(d) { return d.division})
        .entries(courses);
        
    var output = [];
    
    // For each division, calculate rollup values
    _.each(divNest, function(division) {
        
        var rollup = {
            term: term,
            division: division.key,
            course_count: division.values.length
        };
        
        _.each(config.reportOptions, function(option) {
            
            var pctLabel = option + '_pct';
            
            for (var i = 0, len = division.values.length; i < len; i++) {
                
                if (rollup[option]) {
                    rollup[option] += division.values[i][option];
                } else {
                    rollup[option] = division.values[i][option];
                }
                
            }
        	
            if (option === 'published' || option === 'homepage' || option === 'syllabus') {
            	
            	if (rollup[option] === 0) {
                	
                	rollup[pctLabel] = 0;
                	
            	} else {
            	
                    rollup[pctLabel] = getPercent(rollup[option],  rollup.course_count);
                    
                }
            	
            }

    	});
    	
    	_.each(config.reportTabs, function(option) {
        	
        	var label = getTabLabel(option);
        	var pctLabel = label + '_pct';
        	
        	for (var i = 0, len = division.values.length; i < len; i++) {
        	
            	if (rollup[label]) {
                	
                	rollup[label] += division.values[i][label];
                	
            	} else {
                	
                	rollup[label] = division.values[i][label];
                	
            	}
            	
            	if (rollup[label] === 0) {
                	
                	rollup[pctLabel] = 0;
                	
            	} else {
                	
                	rollup[pctLabel] = getPercent(rollup[label], rollup.course_count);
                	
            	}
            	
            }
        	
    	});
        
        output.push(rollup);
        
    });
    
    return output;
    
}


/**
 * @function createReport
 * Writes a CSV report to the file system.
 * @param {string} type - the type of report to create
 * @param {object} courses - the collection of course objects to convert to CSV
 */
function createReport(type, courses) {
    
    var outfile = config.reportFolder + type + '_report_' + term + '.csv'; 
    
    var unparsed = csv.unparse({
        fields: setCsvFields(type), 
        data: processData(type, courses)
    });
        
    if (!fs.existsSync(config.reportFolder)) {
        fs.mkdirSync(config.reportFolder);
    }
    
    writeReport(outfile, unparsed);
    
}


/**
 * @function getCourseDetails
 * Fetches additional course details, based on report options
 * specified in config.json, and adds them to each course object.
 */
function getCourseDetails() {
    
    writeMessage('Fetching course details. Please be patient.\n');
    
    _.each(courses, function(course, idx) {
        
        var url = getEndpoint('course').replace(/:course_id/, course.id);
        
        // Timeout to avoid hitting the rate limit for successive Canvas API calls
        setTimeout(function() {
            
            if (idx % 250 === 0) {
                getTimeRemaining(idx);
            }
                                    
            canvasApiRequest(url, function(args) {

                if (args.isComplete) {
                    
                    // Act on each report option
                    _.each(config.reportOptions, function(option) {
                        
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
                    
                    _.each(config.reportTabs, function(option) {
                        
                        var label = getTabLabel(option);
                        var tab = _.where(args.body.tabs, {label: option});
                        
                        courses[idx][label] = 0;
                        
                        if (tab.length > 0) {
                            if (tab[0].visibility === 'public' && !tab[0].hasOwnProperty('hidden')) {
                                courses[idx][label] = 1;
                            }
                        }
                        
                    });
                    
                }
                
                if (idx === courses.length - 1) {
                    
                    writeMessage("Processing reports...\n");
                    
                    // A hack, but without it occasionally the final 
                    // course details don't make it into the report
                    _.delay(function() {
                        _.each(config.reportTypes, function(type) {
                            createReport(type, courses);
                        });
                    }, 1000);
                }

            });
            
        }, config.canvas.requestInterval * idx);    // May not need this long a delay, but this works OK 
        
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
            
            var dept = getDeptInfo(result.account_id);
            
            var courseObj = {
                id: result.id,
                account_id: result.account_id,
                division: dept.division,
                program: dept.name,
                name: result.name,
                course_code: result.course_code,
                term: term
            };
            
            if (_.contains(config.reportOptions, 'published')) {
                if (result.workflow_state === 'available') {
                    courseObj.published = 1;
                } else {
                    courseObj.published = 0;
                }
            }
            
            if (_.contains(config.reportOptions, 'homepage')) {
                if (result.default_view === 'wiki') {
                    courseObj.homepage = 1;
                } else {
                    courseObj.homepage = 0;
                }
            }

            if (courseObj.division !== null && courseObj.program !== null) {
                courses.push(courseObj);                
            }
            
        });
        
        if (callback && typeof callback === 'function') {
            callback.call(undefined, args);
        }
        
    });
    
}


/**
 * @function getDeptInfo
 * Looks up department and division names from Canvas account id
 * @param {number} id - Canvas account or sub-account id
 * @returns {object} - object containing name of department and division
 */
function getDeptInfo(id) {
    
    var dept = _.where(depts.departments, { id: id });
    var output = {
        name: '',
        division: ''
    }
    
    if (dept.length > 0) {
        output.name = dept[0].code;
        output.division = dept[0].division;
    }

    return output;
    
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
        
        case 'courses':
            endpoint += '/api/v1/accounts/' + account + '/courses?per_page=' + config.canvas.perPage + '&enrollment_term_id=' + termId;
            break;
            
        case 'course':
            endpoint += '/api/v1/courses/:course_id?per_page=' + config.canvas.perPage;
            
            if (_.contains(config.reportOptions, 'syllabus')) {
                endpoint += '&include[]=syllabus_body';
            }
            
            if (_.contains(config.reportOptions, 'enrollment')) {
                endpoint += '&include[]=total_students';
            }
            
            if (config.reportTabs.length > 0) {
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
 * @returns {number} percent - the calculated percentage
 */
function getPercent(num, denom) {
    
    var percent = (num / denom).toPrecision(config.reportPctPrecision);
    
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


function getTimeRemaining(idx) {
    
    var timeRemaining = Math.round(Math.ceil(courses.length - idx) * config.canvas.requestInterval / 1000);
    var message;

    if (timeRemaining > 60) {
        message =  '  ' + Math.round(timeRemaining / 60) + ' minute(s) remaining...\n';
    } else {
        message = '  ' + timeRemaining + ' seconds remaining...\n';
    }
    
    if (timeRemaining >= 10) {
        writeMessage(message);   
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
        
        return sortCourses(courses);
        
    } else if (type === 'departments') {
        
        return sortCourses(countByDept(courses));
        
    } else if (type === 'divisions') {
        
        return sortCourses(countByDiv(courses));
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
        
        fields.push('account_id', 'term', 'id', 'division', 'program', 'course_code', 'name');
    
    } else if (type === 'departments') {
        
        fields.push('term', 'division', 'program', 'course_count');

    } else if (type === 'divisions') {
        
        fields.push('term', 'division', 'course_count');
        
    }
    
    _.each(config.reportOptions, function(option) {
        
        var pctLabel = option + '_pct';
        
        fields.push(option);
        
        if (type !== 'courses') {
         
            if (option !== 'enrollment') {
                fields.push(pctLabel);
            }
            
        }
        
    });
    
    _.each(config.reportTabs, function(option) {
        
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
 * @function sortCourses
 * Does what it says -- sorts courses by program and division
 * @param {object} courses - the collection of courses to sort
 * @returns {object} - the sorted collection
 */
function sortCourses(courses) { 
    
    return _.sortBy(_.sortBy(courses, 'program'), 'division');
    
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
           console.log(error);
           throw(error);
       }
       
       writeMessage('  ' + term + ' report written to file: ' + file + '\n');
        
    });
    
}


checkArgs(cliArgs);

if (term !== null) {
    
    getTermId(function() {
        
        writeMessage('Fetching course list for ' + term + '. Please be patient.\n');
        
        getCourseList(getEndpoint('courses'), function(args) {
             
            if (args.isComplete) {
                
                getCourseDetails();

            } 
            
        });
        
    });
    
}
