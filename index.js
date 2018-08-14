"use strict";

var now;
const stats = fetch("https://updown.io/api/checks?api-key=ro-m39tkgb1wAtmudZEvB4i", {cache: "no-cache"}).then(function (response) {
    now = new Date(response.headers.get("date"));
    return response.json();
});
var summaryTabs;

function formatUptime (uptime) {
    return uptime < 100 ? uptime.toFixed(2) : uptime;
}

function formatDate (dateString, delta) {
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
    const date = new Date(dateString);
    var deltaSeconds = (date - now) / 1000;
    if (deltaSeconds < 0) {
        return formatPastDate(date, Math.abs(deltaSeconds));
    }
    else {
        return formatFutureDate(date, deltaSeconds);
    }
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
    lastCheckCell.textContent = formatDate(status.last_check_at);
    const nextCheckCell = row.querySelector(".next-check");
    nextCheckCell.textContent = formatDate(status.next_check_at);
}

document.addEventListener("DOMContentLoaded", function () {
    stats.then(function (data) {
        const nowUTC = now.toISOString();
        console.log(nowUTC);
        console.log(data);
        const nowElement = document.querySelector("#now time");
        nowElement.setAttribute("datetime", nowUTC);
        nowElement.textContent = now.toLocaleTimeString() + " on " + formatFriendlyDate(now);
        document.querySelector("#total-up-count").textContent = data.filter(status => !status.down).length;
        const totalAverageUptime = data.reduce((total, status) => total + status.uptime, 0) / data.length;
        document.querySelector("#total-average-uptime").textContent = formatUptime(totalAverageUptime) + "%";
        const lastCheck = data.slice().sort((a, b) => new Date(b.last_check_at) - new Date(a.last_check_at))[0];
        document.querySelector("#last-check").textContent = `${lastCheck.alias} was ${lastCheck.down ? "DOWN" : "up"} ${formatDate(lastCheck.last_check_at)}.`;
        const nextCheck = data.slice().sort((a, b) => new Date(a.next_check_at) - new Date(b.next_check_at))[0];
        document.querySelector("#next-check").textContent = `${nextCheck.alias} will be checked ${formatDate(nextCheck.next_check_at)}.`;
        summaryTabs = document.querySelector("#summary .tab-groups");
        data.forEach(function (status) {
            syncSummaryStatus(status);
            syncMainStatus(status);
        });
    });
});
