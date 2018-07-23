"use strict";

var stats = fetch("https://updown.io/api/checks?api-key=ro-m39tkgb1wAtmudZEvB4i").then(response => response.json());

function formatUptime (uptime) {
    return uptime < 100 ? uptime.toFixed(2) : uptime;
}

document.addEventListener("DOMContentLoaded", function () {
    stats.then(function (data) {
        document.querySelector("#total-up-count").textContent = data.filter(status => !status.down).length;
        const totalAverageUptime = data.reduce((total, status) => total + status.uptime, 0) / data.length;
        document.querySelector("#total-average-uptime").textContent = formatUptime(totalAverageUptime) + "%";
        data.forEach(function (status) {
            const row = document.getElementById(status.alias);
            if (!row)
                return;
            const currentStatusCell = row.querySelector(".current-status");
            currentStatusCell.textContent = status.down ? "✘ DOWN!" : "✔ Up!";
            const uptimeCell = row.querySelector(".uptime");
            uptimeCell.textContent = formatUptime(status.uptime) + "%";
        });
    });
});
