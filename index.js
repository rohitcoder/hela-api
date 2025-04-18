const express = require('express');
const db = require('./db').db;
const { generateRandomString } = require('./helper/functions');
const { sendJobToK8S } = require('./helper/k8s');
const dotenv = require('dotenv').config();
const app = express();
const port = 4001;
app.use(express.json());

const env = process.env;
app.get('/status', (req, res) => {
    res.status(200).json({
        message: "Server is running",
        env
    });
});

app.get('/async-status', async (req, res) => {
    let status = await new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve("Server is running");
        }, 1000);
    });
    res.status(200).json({
        message: status
    });
});
app.post('/whitelist-secret', async (req, res) => {
    let secret = req.body.secret;
    if (!secret) {
        res.status(400).json({
            message: "Please provide a secret",
        });
    }
    try {
        // first check if the secret already exists, if not then add it
        const client = await db;
        let secretObj = await client.collection("secrets").findOne({
            secret:
                { $eq: secret }
        });
        if (secretObj) {
            res.status(200).json({
                message: "Secret already exists",
            });
        }
        else {
            await client.collection("secrets").insertOne({ secret: secret });
            res.status(200).json({
                message: "Secret added successfully",
            });
        }
    }
    catch (err) {
        console.log(err);
        res.status(500).json({
            message: "Failed to add secret",
        });
    }
});

app.post('/remove-secret', async (req, res) => {
    let secret = req.body.secret;
    if (!secret) {
        res.status(400).json({
            message: "Please provide a secret",
        });
    }
    try {
        const client = await db;
        let secretObj = await client.collection("secrets").findOne({
            secret:
                { $eq: secret }
        });
        if (!secretObj) {
            res.status(200).json({
                message: "Secret doesn't exist",
            });
        }
        else {
            await client.collection("secrets").deleteOne({ secret: secret });
            res.status(200).json({
                message: "Secret removed successfully",
            });
        }
    }
    catch (err) {
        console.log(err);
        res.status(500).json({
            message: "Failed to remove secret",
        });
    }
}
);

app.get('/list-secrets', async (req, res) => {
    try {
        const client = await db;
        const secrets = await client.collection("secrets").find({}).toArray();
        res.status(200).json({
            secrets: secrets
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).json({
            message: "Failed to fetch secrets",
        });
    }
}
);

app.post('/git-scan/', async (req, res) => {
    let job_name = `scanjob${generateRandomString(5).toLowerCase()}`;
    let job_id = req.body.job_id ? req.body.job_id.toLowerCase() : generateRandomString(5).toLowerCase();
    let product_name = req.body.product_name;
    let branch = req.body.branch;
    let pr_branch = req.body.pr_branch;
    let engagement_name = req.body.engagement_name;
    let repository_link = req.body.repository_link;
    let modules = req.body.modules;
    let slack_url = req.body.slack_url;
    let policy_url = req.body.policy_url;
    let rule_path = req.body.rule_path;
    // if rule_path not provided or blank then use default repo
    if (!rule_path || rule_path === "") {
        rule_path = "https://github.com/rohitcodergroww/semgrep-rules"
    }
    let job_args = [
        "--code-path=" + repository_link,
        "--branch=" + branch,
        "--pr-branch=" + pr_branch,
        "--job-id=" + job_id,
        "--rule-path=" + rule_path,
        "--verbose"
    ]
    if (product_name) {
        job_args.push("--product-name=" + product_name);
    }
    if (policy_url) {
        job_args.push("--policy-url=" + policy_url);
    }
    if (engagement_name) {
        job_args.push("--engagement-name=" + engagement_name);
    }
    if (modules && modules.length > 0) {
        modules = modules.map(module => module.toUpperCase());
        if (modules.includes("SAST")) {
            job_args.push("--sast");
        }
        if (modules.includes("SCA")) {
            job_args.push("--sca");
        }
        if (modules.includes("SECRET")) {
            job_args.push("--secret");
        }
        if (process.env.MONGO_URI) {
            job_args.push("--mongo-uri=" + process.env.MONGO_URI);
        }
        if (process.env.DEFECTDOJO_URL) {
            job_args.push("--defectdojo-url=" + process.env.DEFECTDOJO_URL);
        }
        if (process.env.DEFECTDOJO_API) {
            job_args.push("--defectdojo-token=" + process.env.DEFECTDOJO_API);
        }
    }
    if (slack_url) {
        job_args.push("--slack-url=" + slack_url);
    }

    // Let's write a scan job to the k8s cluster
    let scanJob = {
        "kind": "Job",
        "metadata": {
            "name": job_name
        },
        "spec": {
            "ttlSecondsAfterFinished": 60,
            "template": {
                "spec": {
                    "containers": [
                        {
                            "name": "scanjob",
                            "image": "rohitcoder/hela:v10",
                            "imagePullPolicy": "Always",
                            "args": job_args,
                        }
                    ],
                    "restartPolicy": "Never"
                }
            }
        }
    }
    try {
        let resp = await sendJobToK8S(scanJob);
        res.status(200).json({
            message: `Scan job ${job_name} started successfully!`,
            job_id: job_id
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).json({
            message: "Failed to start scan job",
            error: err
        });
    }
});

app.get('/job-status', async (req, res) => {
    try {
        const job_id = req.query.job_id;

        const client = await db;
        // also to save space lets delete all records which are older than 1 day
        await client.collection("jobs").deleteMany({ created_at: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
        const job = await client.collection("jobs").findOne({ job_id: job_id });

        if (job) {
            res.status(200).json({ "status_code": 200, ...job });
        } else {
            res.status(200).json({ "message": "Job not found, maybe its still processing?", "status_code": 404 });
        }
    } catch (error) {
        console.error("Error fetching job status:", error);
        res.status(500).json({ "message": "Internal server error", "status_code": 500 });
    }
});

app.get('/policy.yaml', (req, res) => {
    res.status(200).sendFile(__dirname + '/policy.yaml');
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
