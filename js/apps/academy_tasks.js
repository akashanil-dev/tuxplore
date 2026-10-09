'use strict';

OS.academyTasks = [
        {
          question: "Task 1 (Incident): Web server is down. Print your current working directory to confirm where you logged in.",
          hint: "Command: pwd",
          answer: "pwd",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('pwd'));
          },
          success: "Good start."
        },
        {
          question: "Task 2 (Audit): Check all files here, including hidden ones (.env, etc.).",
          hint: "Command: ls -a",
          answer: "ls -a",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('ls') && lastCmd.includes('-a'));
          },
          success: "Found them."
        },
        {
          question: "Task 3 (Audit): We need detailed file info (permissions, sizes). List in long format.",
          hint: "Command: ls -l",
          answer: "ls -l",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('ls') && lastCmd.includes('-l'));
          },
          success: "Permissions verified."
        },
        {
          question: "Task 4 (Log hunt): Navigate into the /var/log directory.",
          hint: "Command: cd /var/log",
          answer: "cd /var/log",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('cd /var/log'));
          },
          success: "You are in the logs."
        },
        {
          question: "Task 5 (Inspection): Concatenate and print the 'syslog' file.",
          hint: "Command: cat syslog",
          answer: "cat syslog",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('cat syslog'));
          },
          success: "It's too long, but you viewed it."
        },
        {
          question: "Task 6 (Quick Check): Print only the first 10 lines of 'syslog'.",
          hint: "Command: head syslog",
          answer: "head syslog",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('head syslog'));
          },
          success: "Headers checked."
        },
        {
          question: "Task 7 (Live Monitor): Print the last 10 lines of 'syslog' to see recent errors.",
          hint: "Command: tail syslog",
          answer: "tail syslog",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('tail syslog'));
          },
          success: "Recent errors found."
        },
        {
          question: "Task 8 (Backup): Copy 'syslog' to 'syslog.bak'.",
          hint: "Command: cp syslog syslog.bak",
          answer: "cp syslog syslog.bak",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('cp syslog syslog.bak'));
          },
          success: "Backup created."
        },
        {
          question: "Task 9 (Housekeeping): Rename 'syslog.bak' to 'syslog.old'.",
          hint: "Command: mv syslog.bak syslog.old",
          answer: "mv syslog.bak syslog.old",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('mv syslog.bak syslog.old'));
          },
          success: "File renamed."
        },
        {
          question: "Task 10 (Housekeeping): Delete the 'syslog.old' file to free space.",
          hint: "Command: rm syslog.old",
          answer: "rm syslog.old",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('rm syslog.old'));
          },
          success: "Space freed."
        },
        {
          question: "Task 11 (Deployment): Go back to your home directory.",
          hint: "Command: cd",
          answer: "cd",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd === 'cd' || lastCmd === 'cd ~');
          },
          success: "Back home."
        },
        {
          question: "Task 12 (Scaffolding): Create a directory named 'project'.",
          hint: "Command: mkdir project",
          answer: "mkdir project",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('mkdir project'));
          },
          success: "Directory created."
        },
        {
          question: "Task 13 (Scaffolding): Enter the 'project' directory.",
          hint: "Command: cd project",
          answer: "cd project",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('cd project'));
          },
          success: "You are in."
        },
        {
          question: "Task 14 (Scaffolding): Go up one directory level.",
          hint: "Command: cd ..",
          answer: "cd ..",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('cd ..'));
          },
          success: "Moved up."
        },
        {
          question: "Task 15 (Cleanup): Remove the empty 'project' directory.",
          hint: "Command: rmdir project",
          answer: "rmdir project",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('rmdir project') || lastCmd.startsWith('rm -r project'));
          },
          success: "Removed."
        },
        {
          question: "Task 16 (Troubleshooting): Go back to /var/log.",
          hint: "Command: cd /var/log",
          answer: "cd /var/log",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('cd /var/log'));
          },
          success: "Back in logs."
        },
        {
          question: "Task 17 (Troubleshooting): Search for 'error' in 'syslog'.",
          hint: "Command: grep error syslog",
          answer: "grep error syslog",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('grep') && lastCmd.includes('error') && lastCmd.includes('syslog'));
          },
          success: "Found the errors."
        },
        {
          question: "Task 18 (Troubleshooting): Search for 'error' case-insensitively in 'syslog'.",
          hint: "Command: grep -i error syslog",
          answer: "grep -i error syslog",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('grep') && lastCmd.includes('-i') && lastCmd.includes('error'));
          },
          success: "Found all variations."
        },
        {
          question: "Task 19 (Search): Search for 'failed' in all files in current dir (*).",
          hint: "Command: grep failed *",
          answer: "grep failed *",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('grep') && lastCmd.includes('failed') && lastCmd.includes('*'));
          },
          success: "Found failures across files."
        },
        {
          question: "Task 20 (Permissions): Make 'deploy.sh' executable.",
          hint: "Command: chmod +x deploy.sh",
          answer: "chmod +x deploy.sh",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('chmod +x deploy.sh'));
          },
          success: "Script is executable."
        },
        {
          question: "Task 21 (Reporting): Redirect the output of 'ls' to 'files.txt'.",
          hint: "Command: ls > files.txt",
          answer: "ls > files.txt",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.includes('ls') && lastCmd.includes('>') && lastCmd.includes('files.txt'));
          },
          success: "Output saved."
        },
        {
          question: "Task 22 (Reporting): Append 'DONE' to 'files.txt'.",
          hint: "Command: echo DONE >> files.txt",
          answer: "echo DONE >> files.txt",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.includes('echo') && lastCmd.includes('>>') && lastCmd.includes('files.txt'));
          },
          success: "Appended."
        },
        {
          question: "Task 23 (Data Pipeline): Count lines in 'files.txt'.",
          hint: "Command: wc -l files.txt",
          answer: "wc -l files.txt",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('wc -l files.txt'));
          },
          success: "Counted."
        },
        {
          question: "Task 24 (Data Pipeline): Sort 'files.txt'.",
          hint: "Command: sort files.txt",
          answer: "sort files.txt",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('sort files.txt'));
          },
          success: "Sorted."
        },
        {
          question: "Task 25 (Data Pipeline): View unique lines in 'files.txt'.",
          hint: "Command: uniq files.txt",
          answer: "uniq files.txt",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('uniq files.txt'));
          },
          success: "Duplicates removed."
        },
        {
          question: "Task 26 (Data Pipeline): Pipe 'sort files.txt' to 'uniq'.",
          hint: "Command: sort files.txt | uniq",
          answer: "sort files.txt | uniq",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.includes('sort files.txt') && lastCmd.includes('|') && lastCmd.includes('uniq'));
          },
          success: "Chained."
        },
        {
          question: "Task 27 (System Info): Check disk space usage.",
          hint: "Command: df -h",
          answer: "df -h",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('df -h'));
          },
          success: "Disk checked."
        },
        {
          question: "Task 28 (System Info): Check memory usage.",
          hint: "Command: free -m",
          answer: "free -m",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('free'));
          },
          success: "Memory checked."
        },
        {
          question: "Task 29 (Process Mgmt): View running processes.",
          hint: "Command: top or ps",
          answer: "top",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('top') || lastCmd.startsWith('ps'));
          },
          success: "Processes listed."
        },
        {
          question: "Task 30 (User Mgmt): Print your current username.",
          hint: "Command: whoami",
          answer: "whoami",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('whoami'));
          },
          success: "Identity confirmed."
        },
        {
          question: "Task 31 (Finding Files): Find all files named 'config.yml' in current dir.",
          hint: "Command: find . -name config.yml",
          answer: "find . -name config.yml",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('find') && lastCmd.includes('config.yml'));
          },
          success: "Found."
        },
        {
          question: "Task 32 (Network): Ping google.com 3 times.",
          hint: "Command: ping -c 3 google.com",
          answer: "ping -c 3 google.com",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('ping') && lastCmd.includes('google.com'));
          },
          success: "Network is up."
        },
        {
          question: "Task 33 (Download): Use curl or wget to fetch example.com.",
          hint: "Command: curl example.com",
          answer: "curl example.com",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('curl') || lastCmd.startsWith('wget'));
          },
          success: "Downloaded."
        },
        {
          question: "Task 34 (Compression): Tar and gzip 'project' dir into 'proj.tar.gz'.",
          hint: "Command: tar -czvf proj.tar.gz project",
          answer: "tar -czvf proj.tar.gz project",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('tar') && lastCmd.includes('proj.tar.gz'));
          },
          success: "Archived."
        },
        {
          question: "Task 35 (Compression): Extract 'proj.tar.gz'.",
          hint: "Command: tar -xzvf proj.tar.gz",
          answer: "tar -xzvf proj.tar.gz",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('tar') && lastCmd.includes('-x'));
          },
          success: "Extracted."
        },
        {
          question: "Task 36 (Permissions): Change owner of 'files.txt' to root (needs sudo).",
          hint: "Command: sudo chown root files.txt",
          answer: "sudo chown root files.txt",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.includes('chown root files.txt'));
          },
          success: "Owner changed."
        },
        {
          question: "Task 37 (Admin): Switch to the root user.",
          hint: "Command: sudo su",
          answer: "sudo su",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.includes('sudo su') || lastCmd.includes('sudo -i'));
          },
          success: "You are root."
        },
        {
          question: "Task 38 (Environment): Print all environment variables.",
          hint: "Command: env or printenv",
          answer: "env",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('env') || lastCmd.startsWith('printenv'));
          },
          success: "Vars printed."
        },
        {
          question: "Task 39 (Environment): Echo the PATH variable.",
          hint: "Command: echo $PATH",
          answer: "echo $PATH",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.includes('echo $PATH'));
          },
          success: "Path printed."
        },
        {
          question: "Task 40 (History): View your command history.",
          hint: "Command: history",
          answer: "history",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('history'));
          },
          success: "History viewed."
        },
        {
          question: "Task 41 (Text Processing): Cut the first column from 'files.txt' (delimiter space).",
          hint: "Command: cut -d' ' -f1 files.txt",
          answer: "cut -d' ' -f1 files.txt",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('cut') && lastCmd.includes('files.txt'));
          },
          success: "Column extracted."
        },
        {
          question: "Task 42 (Text Processing): Translate lowercase to uppercase in 'files.txt'.",
          hint: "Command: cat files.txt | tr 'a-z' 'A-Z'",
          answer: "tr 'a-z' 'A-Z' < files.txt",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.includes('tr'));
          },
          success: "Translated."
        },
        {
          question: "Task 43 (Date): Print the current date and time.",
          hint: "Command: date",
          answer: "date",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('date'));
          },
          success: "Date printed."
        },
        {
          question: "Task 44 (System): Check system uptime.",
          hint: "Command: uptime",
          answer: "uptime",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('uptime'));
          },
          success: "Uptime checked."
        },
        {
          question: "Task 45 (Network): Check listening ports.",
          hint: "Command: netstat -tuln or ss -tuln",
          answer: "ss -tuln",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('netstat') || lastCmd.startsWith('ss'));
          },
          success: "Ports checked."
        },
        {
          question: "Task 46 (Process Mgmt): Kill process 1234.",
          hint: "Command: kill 1234",
          answer: "kill 1234",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('kill 1234'));
          },
          success: "Process terminated."
        },
        {
          question: "Task 47 (Permissions): Set 'files.txt' to read/write for owner only (600).",
          hint: "Command: chmod 600 files.txt",
          answer: "chmod 600 files.txt",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('chmod 600 files.txt'));
          },
          success: "Permissions updated."
        },
        {
          question: "Task 48 (Filesystem): Create an empty file called 'lock'.",
          hint: "Command: touch lock",
          answer: "touch lock",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('touch lock'));
          },
          success: "File created."
        },
        {
          question: "Task 49 (Alias): Create an alias 'll' for 'ls -la'.",
          hint: "Command: alias ll='ls -la'",
          answer: "alias ll='ls -la'",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('alias ll'));
          },
          success: "Alias set."
        },
        {
          question: "Task 50 (Exit): You survived! Clear the terminal.",
          hint: "Command: clear",
          answer: "clear",
          check: (shell) => {
            const hist = OS.state.history;
            const lastCmd = hist[hist.length - 1];
            return lastCmd && (lastCmd.startsWith('clear'));
          },
          success: "All done."
        },
];
