const k8s = require('@kubernetes/client-node');

exports.sendJobToK8S = async(job_json) => {
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    const k8s2Api = kc.makeApiClient(k8s.BatchV1Api);
    try {
        const podsRes = await k8sApi.listNamespacedPod("security-team");
        console.log(podsRes.body);
    } catch (err) {
        console.error(err);
    }
    try {
        const res = await k8s2Api.createNamespacedJob("security-team", job_json);
        return res;
    } catch (err) {
        console.log(err);
        throw (err);
    }
}