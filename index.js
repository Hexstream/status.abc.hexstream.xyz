"use strict";

var now;
var rawSymbol = Symbol("raw");

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

const stats = fetch("https://updown.io/api/checks?api-key=ro-m39tkgb1wAtmudZEvB4i").then(function (response) {
    now = new Date(response.headers.get("date"));
    return response.json();
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
    const element = summaryTabs.querySelector(`[href="#${status.alias}"]`);
    element.classList.add(status.down ? "down" : "up");
    element.textContent = formatUptime(status.uptime) + "%";
}

function syncMainStatus (status) {
    const row = document.getElementById(status.alias);
    if (!row)
        return;
    const currentStatusCell = row.querySelector(".current-status");
    currentStatusCell.textContent = status.down ? "✘ DOWN!" : "✔ Up!";
    const uptimeCell = row.querySelector(".uptime");
    uptimeCell.textContent = formatUptime(status.uptime) + "%";
    const lastCheckCell = row.querySelector(".last-check");
    lastCheckCell.textContent = status.lastCheck.formatDate();
    const nextCheckCell = row.querySelector(".next-check");
    nextCheckCell.textContent = status.nextCheck.formatDate();
}

function syncDetailedStatus (recentChecks, pendingChecks, upcomingChecks) {
    function process (checks, id, additionalProcessing) {
        const template = document.querySelector(`#${id} > tbody > template`);
        const recentBody = template.parentElement;
        checks.forEach(function (check) {
            const row = template.content.cloneNode(true);
            const websiteCell = row.querySelector(".website a");
            websiteCell.href = "#" + check.alias;
            websiteCell.textContent = check.alias;
            additionalProcessing(check, row);
            recentBody.appendChild(row);
        });
    }
    process(recentChecks, "recent-checks", function (check, row) {
        row.querySelector(".status").textContent = check.down ? "✘ DOWN!" : "✔ Up!";
        row.querySelector(".when").textContent = check.lastCheck.formatDate();
    });
    function formatNextCheck (check, row) {
        row.querySelector(".when").textContent = check.nextCheck.formatDate();
    }
    process(pendingChecks, "pending-checks", formatNextCheck);
    process(upcomingChecks, "upcoming-checks", formatNextCheck);
}

function transformObject (object, transformers) {
    const transformed = {};
    Object.keys(object).forEach(function (key) {
        const value = object[key];
        const transformer = transformers[key];
        transformed[key] = transformer ? transformer(value) : value;
    });
    return transformed;
}

function normalizeRawChecks (rawChecks) {
    function utcToDate (utc) {
        return utc ? new Date(utc) : null;
    }
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
        return transformed;
    });
    transformed[rawSymbol] = rawChecks;
    return transformed;
}

function computeRecentPendingUpcoming (checks) {
    const recent = checks.slice().sort((a, b) => b.lastCheck.when - a.lastCheck.when);
    const pendingOrUpcoming = checks.slice().sort((a, b) => a.nextCheck.when - b.nextCheck.when);
    return [
        recent,
        pendingOrUpcoming.filter(check => check.nextCheck.isPending),
        pendingOrUpcoming.filter(check => !check.nextCheck.isPending),
        pendingOrUpcoming[0]
    ];
}

document.addEventListener("DOMContentLoaded", function () {
    stats.then(normalizeRawChecks).then(function (checks) {
        const nowUTC = now.toISOString();
        console.log(nowUTC);
        console.log(checks);
        const nowElement = document.querySelector("#now time");
        nowElement.setAttribute("datetime", nowUTC);
        nowElement.textContent = now.toLocaleTimeString() + " on " + formatFriendlyDate(now);
        document.querySelector("#total-up-count").textContent = checks.filter(status => !status.down).length;
        const totalAverageUptime = checks.reduce((total, status) => total + status.uptime, 0) / checks.length;
        document.querySelector("#total-average-uptime").textContent = formatUptime(totalAverageUptime) + "%";
        const [recentChecks, pendingChecks, upcomingChecks, oldestPendingOrUpcoming] = computeRecentPendingUpcoming(checks);
        const mostRecentCheck = recentChecks[0];
        document.querySelector("#last-check").textContent = `${mostRecentCheck.alias} was ${mostRecentCheck.down ? "DOWN" : "up"} ${mostRecentCheck.lastCheck.formatDate()}.`;
        const mostUpcomingCheck = oldestPendingOrUpcoming;
        document.querySelector("#next-check").textContent = `${mostUpcomingCheck.alias} ${mostUpcomingCheck.nextCheck.isPending ? "has a check pending since" : "will be checked"} ${mostUpcomingCheck.nextCheck.formatDate()}.`;
        summaryTabs = document.querySelector("#summary .tab-groups");
        checks.forEach(function (status) {
            syncSummaryStatus(status);
            syncMainStatus(status);
        });
        syncDetailedStatus(recentChecks, pendingChecks, upcomingChecks);
    });
});
