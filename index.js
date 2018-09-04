"use strict";

function transformObject (object, transformers) {
    const transformed = {};
    Object.keys(object).forEach(function (key) {
        const value = object[key];
        const transformer = transformers[key];
        transformed[key] = transformer ? transformer(value) : value;
    });
    return transformed;
}

class CheckGroup {

    static normalizeRawChecks (rawChecks) {
        function utcToDate (utc) {
            return utc ? new Date(utc) : null;
        }
        function formatPeriod (seconds) {
            if (seconds % 60 !== 0)
                return seconds + "s";
            if (seconds % 3600 !== 0)
                return seconds / 60 + "m";
            else
                return seconds / 3600 + "h";
        }
        const periodsSet = new Set();
        const transformed = rawChecks.map(function (rawCheck) {
            const transformed = transformObject(rawCheck, {
                down_since: utcToDate,
                last_check_at: utcToDate,
                next_check_at: utcToDate,
                mute_until: utcToDate,
                ssl: ssl => transformObject(ssl, {
                    tested_at: utcToDate
                })
            });
            transformed.lastCheck = new CheckTime("last", transformed.last_check_at);
            delete transformed.last_check_at;
            transformed.nextCheck = new CheckTime("next", transformed.next_check_at);
            delete transformed.next_check_at;
            transformed[rawSymbol] = rawCheck;
            periodsSet.add(transformed.period);
            transformed.formattedPeriod = formatPeriod(transformed.period);
            return transformed;
        });
        const periodsArray = Array.from(periodsSet).sort((a, b) => a - b);
        transformed.forEach(function (check) {
            check.tier = periodsArray.indexOf(check.period) + 1;
        });
        transformed[rawSymbol] = rawChecks;
        return transformed;
    }

    static computeRecentPendingUpcoming (checks) {
        const recent = checks.slice().sort((a, b) => b.lastCheck.when - a.lastCheck.when);
        const pendingOrUpcoming = checks.slice().sort((a, b) => a.nextCheck.when - b.nextCheck.when);
        return [
            recent,
            pendingOrUpcoming.filter(check => check.nextCheck.isPending),
            pendingOrUpcoming.filter(check => !check.nextCheck.isPending),
            pendingOrUpcoming[0]
        ];
    }

    constructor (checks) {
        this.checks = checks;
        const [recentChecks, pendingChecks, upcomingChecks, oldestPendingOrUpcoming] = CheckGroup.computeRecentPendingUpcoming(checks);
        this.recentChecks = recentChecks;
        this.pendingChecks = pendingChecks;
        this.upcomingChecks = upcomingChecks;
        this.oldestPendingOrUpcoming = oldestPendingOrUpcoming;
        this.up = checks.filter(status => !status.down);
        this.down = checks.filter(status => status.down);
        this.totalAverageUptime = checks.reduce((total, status) => total + status.uptime, 0) / checks.length;
    }

}

class CheckTime {

    static createDateFormatter (isInThePast) {
        function formatDeltaSeconds (deltaSeconds) {
            function format (delta) {
                return (delta < 10 ? "0" : "") + delta.toFixed(0);
            }
            deltaSeconds = Math.round(deltaSeconds);
            return format(Math.floor(deltaSeconds / 60)) + ":" + format(deltaSeconds % 60);
        }
        function formatPastDate (date, deltaSeconds) {
            return formatDeltaSeconds(deltaSeconds) + " ago at " + date.toLocaleTimeString();
        }
        function formatFutureDate (date, deltaSeconds) {
            return "in " + formatDeltaSeconds(deltaSeconds) + " at " + date.toLocaleTimeString();
        }
        let core = isInThePast ? formatPastDate : formatFutureDate;
        return function () {
            return core(this.when, this.deltaSeconds);
        };
    }

    constructor (type, when) {
        this.type = type;
        this.when = when;
        this.deltaSeconds = Math.abs(Math.round((when - now) / 1000));
        this.isPending = type === "next" && now > when;
        this.formatDate = CheckTime.createDateFormatter(now > when);
    }

};

var allChecks;
var now;
var rawSymbol = Symbol("raw");
const allChecksRequest = fetch("https://updown.io/api/checks?api-key=ro-m39tkgb1wAtmudZEvB4i").then(function (response) {
    now = new Date(response.headers.get("date"));
    return response.json();
}).then(rawChecks => new CheckGroup(CheckGroup.normalizeRawChecks(rawChecks)));
allChecksRequest.then(function (all) {
    allChecks = all;
});
var summaryTabs;


function formatUptime (uptime) {
    return uptime < 100 ? uptime.toFixed(2) : uptime;
}

const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function formatFriendlyDate (date) {
    return date.getDate() + " " + months[date.getMonth()] + " " + date.getFullYear();
}

function syncSummaryStatus (status) {
    const link = summaryTabs.querySelector(`[href="#${status.alias}"]`);
    const tab = link.parentElement;
    tab.dataset.tier = status.tier;
    tab.classList.add(status.down ? "down" : "up");
    link.textContent = formatUptime(status.uptime) + "%";
}

function syncMainStatus (status) {
    const row = document.getElementById(status.alias);
    if (!row)
        return;
    row.dataset.tier = status.tier;
    row.classList.add(status.down ? "down" : "up");
    const currentStatusCell = row.querySelector(".current-status");
    currentStatusCell.textContent = status.down ? "✘ DOWN!" : "✔ Up!";
    const uptimeCell = row.querySelector(".uptime");
    uptimeCell.textContent = formatUptime(status.uptime) + "%";
    const lastCheckCell = row.querySelector(".last-check");
    lastCheckCell.textContent = status.lastCheck.formatDate();
    const nextCheckCell = row.querySelector(".next-check");
    nextCheckCell.textContent = status.nextCheck.formatDate();
    const intervalCell = row.querySelector(".interval");
    intervalCell.textContent = status.formattedPeriod;
}

function syncDetailedStatus (recentChecks, pendingChecks, upcomingChecks) {
    function splitWebsitePrefixSuffix (name) {
        const components = name.split(".");
        const splitIndex = components.length - 2;
        return [
            components.slice(0, splitIndex).join("."),
            "." + components.slice(splitIndex).join(".")
        ];
    }
    function process (checks, id, additionalProcessing) {
        const template = document.querySelector(`#${id} > tbody > template`);
        const recentBody = template.parentElement;
        checks.forEach(function (check) {
            const row = template.content.cloneNode(true).firstElementChild;
            row.dataset.tier = check.tier;
            row.classList.add(check.down ? "down" : "up");
            const websiteCell = row.querySelector(".website a");
            websiteCell.href = "#" + check.alias;
            const [websitePrefix, websiteSuffix] = splitWebsitePrefixSuffix(check.alias);
            websiteCell.textContent = websitePrefix;
            websiteCell.insertAdjacentHTML("beforeend", "<wbr>");
            websiteCell.insertAdjacentText("beforeend", websiteSuffix);
            additionalProcessing(check, row);
            recentBody.appendChild(row);
        });
        if (checks.length === 0)
            document.getElementById(id).remove();
    }
    process(recentChecks, "recent-checks", function (check, row) {
        row.querySelector(".current-status").textContent = check.down ? "✘ DOWN!" : "✔ Up!";
        row.querySelector(".when").textContent = check.lastCheck.formatDate();
    });
    function formatNextCheck (check, row) {
        row.querySelector(".when").textContent = check.nextCheck.formatDate();
    }
    process(pendingChecks, "pending-checks", formatNextCheck);
    process(upcomingChecks, "upcoming-checks", formatNextCheck);
}

function updateUptimeSummaryNode (node, checkGroup) {
    node.querySelector(".websites-currently-up .v").textContent = checkGroup.up.length + "/" + checkGroup.checks.length;
    node.querySelector(".average-uptime-this-month .v").textContent = formatUptime(checkGroup.totalAverageUptime) + "%";
    const mostRecentCheck = checkGroup.recentChecks[0];
    const lastCheckNode = node.querySelector(".last-and-next-checks .last-check .v");
    lastCheckNode.textContent = `${mostRecentCheck.alias} was ${mostRecentCheck.down ? "DOWN" : "up"} `;
    lastCheckNode.insertAdjacentHTML("beforeend", `<time datetime="${mostRecentCheck.lastCheck.when.toISOString()}">${mostRecentCheck.lastCheck.formatDate()}</time>.`);
    const mostUpcomingCheck = checkGroup.oldestPendingOrUpcoming;
    const nextCheckNode = node.querySelector(".last-and-next-checks .next-check .v");
    nextCheckNode.textContent = `${mostUpcomingCheck.alias} ${mostUpcomingCheck.nextCheck.isPending ? "has a check pending since" : "will be checked"} `;
    nextCheckNode.insertAdjacentHTML("beforeend", `<time datetime="${mostUpcomingCheck.nextCheck.when.toISOString()}">${mostUpcomingCheck.nextCheck.formatDate()}</time>.`);
}

document.addEventListener("DOMContentLoaded", function () {
    allChecksRequest.then(function (allChecks) {
        const nowUTC = now.toISOString();
        console.log(nowUTC);
        console.log(allChecks);
        const nowElement = document.querySelector("#now time");
        nowElement.setAttribute("datetime", nowUTC);
        nowElement.textContent = now.toLocaleTimeString() + " on " + formatFriendlyDate(now);
        for (var checkGroupName of ["all", "hexstreamsoft.com", "hexstream.net", "hexstream.xyz"]) {
            updateUptimeSummaryNode(document.querySelector(`.uptime-summary[data-check-group="${checkGroupName}"]`),
                                    checkGroupName === "all" ? allChecks : new CheckGroup(allChecks.checks.filter(check => check.alias.endsWith(checkGroupName))));
        }

        summaryTabs = document.querySelector("#summary .tab-groups");
        allChecks.checks.forEach(function (status) {
            syncSummaryStatus(status);
            syncMainStatus(status);
        });
        syncDetailedStatus(allChecks.recentChecks, allChecks.pendingChecks, allChecks.upcomingChecks);
    });
});
