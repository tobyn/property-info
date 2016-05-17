var SEARCH_URL =
  'http://www.manateepao.com/ManateeFL/search/CommonSearch.aspx?mode=ADDRESS';

phantom.addCookie({
  name: 'DISCLAIMER',
  value: '1',
  domain: 'www.manateepao.com',
  path: '/'
});


var SUFFIX_MAP = {
  AVE: "AVE",
  AVENUE: "AVE",
  BLVD: "BLVD",
  CIR: "CIR",
  CT: "CT",
  CV: "CV",
  DR: "DR",
  DRIVE: "DR",
  GLEN: "GLEN",
  GLN: "GLN",
  HWY: "HWY",
  LN: "LN",
  LOOP: "LOOP",
  PIKE: "PIKE",
  PKY: "PKY",
  PL: "PL",
  PLACE: "PL",
  PLZ: "PLZ",
  RD: "RD",
  RUN: "RUN",
  ST: "ST",
  STREET: "ST",
  TER: "TER",
  TR: "TRL",
  TRAIL: "TRL",
  TRCE: "TRCE",
  TRL: "TRL",
  WALK: "WALK",
  WAY: "WAY",
  XING: "XING"
};

var DIRECTION_MAP = {
  E:  'E',
  N:  'N',
  NE: 'NE',
  NW: 'NW',
  S:  'S',
  W:  'W'
};

var UNIT_DESIGNATORS = [ 'APT', 'UNIT' ];


var system = require('system');

if (system.args.length < 2) {
  printErr('Usage: ' + system.args[0] + ' <address>');
  phantom.exit(1);
} else {
  search(system.args.slice(1).join(' '));
}

function search(address) {
  print('Searching Manatee County property appraiser for ' + address + '...');

  var page = require('webpage').create();
  page.open(SEARCH_URL,requireSuccess(onSearchPage));

  page.onError = onError;

  var summary = {};

  function onSearchPage(status) {
    print('Opened search page');
    page.onLoadFinished = requireSuccess(onResultsPage);
    page.evaluate(fillSearchForm,parseAddress(address));
    print('Sent search request');
  }

  function onResultsPage() {
    print('Loaded results page');

    var info = page.evaluate(extractSearchResults);
    if (info.error) {
      printErr(info.error);
      phantom.exit(1);
    } else if (info.results.length === 1) {
      proceedWithResult(0);
    } else {
      chooseResult(info.results);
    }
  }

  function chooseResult(results) {
    print('Choose a property:');

    for (var i = 0; i < results.length; i++) {
      var result = results[i];
      print('[' + (i + 1) + '] ' + result.address + ' (' + result.owner + ')');
    }

    proceedWithResult(chooseNumberInRange(1,results.length)-1);
  }

  function proceedWithResult(index) {
    page.onLoadFinished = requireSuccess(onProfilePage);
    click('tr.SearchResults:nth-child(' + (index + 3) + ')');
  }

  function onProfilePage() {
    print('Loaded profile page');

    summary.address = page.evaluate(extractAddress);

    page.onLoadFinished = requireSuccess(onResidentialPage);
    click('.contentpanel #sidemenu li:nth-child(4) a');
  }

  function onResidentialPage() {
    print('Loaded residential page');

    summary.yearBuilt = page.evaluate(extractResidentialItem,'Year Built');
    summary.underRoof = page.evaluate(extractResidentialItem,'Total Under Roof');

    page.onLoadFinished = requireSuccess(onPermitsPage);
    click('.contentpanel #sidemenu li:nth-child(7) a');
  }

  function onPermitsPage() {
    print('Loaded permits page');

    summary.permits = [];

    page.onLoadFinished = requireSuccess(onAnotherPermit);
    onLoadPermit();
  }

  function onAnotherPermit() {
    print('Loaded another permit');
    onLoadPermit();
  }

  function onLoadPermit() {
    var permit = page.evaluate(extractPermitSummary);
    if (permit && permit.length) {
      summary.permits.push(permit);
    } else {
      onFinish();
      return;
    }

    if (page.evaluate(hasMorePermits))
      click('.icon-angle-right');
    else
      onFinish();
  }

  function onFinish() {
    printPropertySummary(summary);
    phantom.exit();
  }

  function onError(msg, trace) {
    // suppress page errors
  }

  function click(selector) {
    var error = page.evaluate(function(selector) {
      var element = document.querySelector(selector);
      if (!element)
        return "Couldn't find element matching " + selector;

      element.click();
    },selector);

    if (error) {
      printErr(error);
      phantom.exit(1);
    }
  }
}


function printPropertySummary(summary) {
  print('');
  print(summary.address);
  print('');

  if (summary.yearBuilt)
    print('Built in ' + summary.yearBuilt);
  else
    print("Couldn't determine age of structure");

  if (summary.underRoof) {
    print('');
    print(summary.underRoof + ' sq ft under roof');
  }

  print('');

  if (!summary.permits) {
    print('No permits found');
    return;
  }

  print('PERMITS');
  print('');

  summary.permits.forEach(function(p) {
    p.forEach(function(r) {
      print(r.join(' '));
    });

    print('');
  });

  print('End of permits');
}


function chooseNumberInRange(min, max) {
  var choice, input;

  do {
    print('Enter a number between ' + min + ' and ' + max);
    input = system.stdin.readLine();
    choice = Number(input);

    if (isNaN(choice) || choice < min || choice > max) {
      choice = null;
      printErr('"' + input + '" is not a valid choice. Try again.');
    }
  } while (typeof choice !== 'number');

  return choice;
}

function extractSearchResults() {
  var errorElements = document.getElementsByTagName('large');
  if (errorElements.length > 1) {
    return { error: errorElements[1].textContent };
  } else {
    var resultRows = document.querySelectorAll('tr.SearchResults');
    var resultRowCount = resultRows.length;

    if (resultRowCount === 0)
      return { error: "Missing expected elements on results page" };

    var results = [];

    for (var i = 0, end = resultRows.length; i < end; i++) {
      var children = resultRows[i].children;
      results.push({
        owner: children[2].children[0].textContent,
        address: children[3].children[0].textContent
      });
    }

    return { results: results };
  }
}

function extractAddress() {
  var rows = document.querySelectorAll('#ID\\ Block tr');
  for (var i = 0, end = rows.length; i < end; i++) {
    var children = rows[i].children;
    if (children[0].textContent === 'Primary Address Location')
      return children[1].textContent;
  }
}

function extractResidentialItem(label) {
  var rows = document.querySelectorAll('#Residential tr');
  for (var i = 0, end = rows.length; i < end; i++) {
    var children = rows[i].children;
    if (children[0].textContent === label)
      return children[1].textContent;
  }
}

function extractPermitSummary() {
  var rows = document.querySelectorAll('#Permits tr');
  if (rows.length < 2)
    return;

  var permit = [];

  for (var i = 0, end = rows.length - 1; i < end; i++) {
    var children = rows[i].children;
    permit.push([children[0].textContent, children[1].textContent]);
  }

  return permit;
}

function fillSearchForm(fields) {
  var form = document.getElementById('frmMain');

  if (fields.number)
    form.inpNumber.value = fields.number;

  if (fields.unit)
    form.inpUnit.value = fields.unit;

  form.inpStreet.value = fields.street;

  if (fields.direction)
    form.inpAdrdir.value = fields.direction;

  if (fields.suffix1)
    form.inpSuffix1.value = fields.suffix1;

  if (fields.suffix2)
    form.inpSuffix2.value = fields.suffix2;

  form.selPageSize.value = 100;

  form.submit();
}

function hasMorePermits() {
  return !!document.querySelector('.icon-angle-right');
}

function isNumberString(s) {
  return s.match(/^\d+$/);
}

function parseAddress(address) {
  var tokens = address.split(' ');
  var fields = {};

  // If the first token is a number, it's assumed to be the house number.
  if (tokens.length > 0 && isNumberString(tokens[0]))
    fields.number = tokens.shift();

  // If the end of the address is a number, it might be a unit number.
  if (tokens.length > 0 && isNumberString(tokens[tokens.length - 1])) {
    fields.unit = tokens.pop();

    // We might have written Apt, Unit, or whatever here. Discard it.
    if (tokens.length > 0) {
      var possibleUnitDesignator = tokens[tokens.length - 1].toUpperCase();
      if (UNIT_DESIGNATORS.indexOf(possibleUnitDesignator) > -1)
        tokens.pop();
    }
  }

  while (tokens.length > 1) {
    var input = tokens.pop();
    var token = input.toUpperCase();

    // Take the first token that looks like a direction.
    if (!fields.direction && DIRECTION_MAP[token]) {
      fields.direction = DIRECTION_MAP[token];
      continue;
    }

    if (fields.suffix2 || !SUFFIX_MAP[token]) {
      // If we've already found two suffixes, or found a token that
      // doesn't look like a suffix, we've gone too far.
      tokens.push(input);
      break;
    } else if (fields.suffix1) {
      // Found second suffix
      fields.suffix2 = fields.suffix1;
      fields.suffix1 = SUFFIX_MAP[token];
    } else {
      // Found first suffix
      fields.suffix1 = SUFFIX_MAP[token];
    }
  }

  // Whatever's left is the street portion of the address.
  fields.street = tokens.join(' ');
  return fields;
}

function print(message) {
  system.stdout.writeLine(message);
}

function printErr(message) {
  system.stderr.writeLine(message);
}

function requireSuccess(onSuccess) {
  return function(status) {
    if (status !== 'success') {
      printErr('Bad page load status: ' + status);
      phantom.exit(1);
    } else {
      onSuccess();
    }
  };
}
