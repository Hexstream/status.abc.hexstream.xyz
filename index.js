"use strict";

var stats = fetch("https://updown.io/api/checks?api-key=ro-m39tkgb1wAtmudZEvB4i").then(response => response.json());

document.addEventListener("DOMContentLoaded", function () {
    stats.then(function (data) {
        data.forEach(function (status) {
            console.log(status);
            const row = document.getElementById(status.alias);
            if (!row)
                return;
            const currentStatusCell = row.querySelector(".current-status");
            currentStatusCell.textContent = status.down ? "✘ DOWN!" : "✔ Up!";
            const uptimeCell = row.querySelector(".uptime");
            uptimeCell.textContent = status.uptime + "%";
        });
    });
});
