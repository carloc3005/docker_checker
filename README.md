# Checkers — Dockerized CI/CD on AWS

A browser checkers game, containerized with Docker and deployed through a full CI/CD pipeline on AWS: every push to `main` is automatically built, pushed to a container registry, and rolled out to a live running service — no manual steps required.

**Live architecture:** GitHub → AWS CodePipeline → AWS CodeBuild → Amazon ECR → Amazon ECS (Fargate)

---

## Overview

| Piece | Service | Purpose |
|---|---|---|
| Source control | GitHub | Hosts the game code, `Dockerfile`, and `buildspec.yml` |
| Registry | Amazon ECR | Stores the built Docker image |
| Build | AWS CodeBuild | Builds the image and pushes it to ECR on every commit |
| Orchestration | AWS CodePipeline | Wires source → build → deploy together, triggered by a GitHub webhook |
| Compute | Amazon ECS (Fargate) | Runs the container — serverless, no EC2 instances to manage |
| Permissions | IAM | Scoped roles/users for CodeBuild, CodePipeline, and ECS to talk to each other securely |

---

## 1. IAM setup

Created an IAM user for CLI/console access to the AWS account, with administrator permissions for building out the infrastructure, plus a CLI access key for `aws` commands from the terminal.

<img src="screenshots/cloud-1.png" width="700" alt="IAM create user"> <img src="screenshots/cloud-2.png" width="700" alt="IAM attach AdministratorAccess">

User created, and console sign-in credentials retrieved:

<img src="screenshots/cloud-3.png" width="700" alt="IAM user created">

Generated a CLI access key for local `aws` CLI authentication:

<img src="screenshots/cloud-4.png" width="500" alt="Access key use case"> <img src="screenshots/cloud-5.png" width="500" alt="Access key description tag"> <img src="screenshots/cloud-6.png" width="500" alt="Access key retrieved">

---

## 2. Containerizing the game

The repo already had `index.html`, `style.css`, and `script.js` for the checkers game. Added a `Dockerfile` that serves the static files with Nginx:

```dockerfile
FROM nginx:latest
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

<img src="screenshots/cloud-8.png" width="600" alt="Dockerfile contents">

Built and ran the image locally to confirm it worked before touching AWS:

```
docker build -t docker_checker .
docker run -d -p 8080:80 docker_checker
```

<img src="screenshots/cloud-9.png" width="600" alt="docker run in terminal"> <img src="screenshots/cloud-10.png" width="600" alt="Game running at localhost:8080">

> **Gotcha:** on Apple Silicon (M-series) Macs, Docker builds `arm64` images by default. AWS Fargate requires `linux/amd64`. Build with `docker build --platform linux/amd64 -t docker_checker .` to avoid a `CannotPullContainerError` later in ECS.

GitHub Desktop confirmed the repo was clean and synced before pushing infrastructure files:

<img src="screenshots/cloud-7.png" width="600" alt="GitHub Desktop no local changes">

---

## 3. Amazon ECR — image registry

Created a private ECR repository to store the built image:

<img src="screenshots/cloud-11.png" width="700" alt="Create ECR repository">

Tagged and pushed the local image:

```
docker tag docker_checker:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/docker-project:latest
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/docker-project:latest
```

<img src="screenshots/cloud-12.png" width="500" alt="Reference tag command"> <img src="screenshots/cloud-13.png" width="500" alt="Terminal tag/push"> <img src="screenshots/cloud-14.png" width="500" alt="Image pushed to ECR">

> **Gotcha:** `docker tag docker_checker: latest ...` (stray space after the colon) gets parsed as two arguments and fails with `'docker tag' requires 2 arguments`. No space between the image name and its tag.

---

## 4. Networking — VPC, subnets, and security groups

ECS Fargate tasks use `awsvpc` networking, so they need subnets in a VPC and a security group. Set up:
- 2 public subnets across different Availability Zones (for redundancy)
- An Internet Gateway + route table so tasks can reach the internet (to pull images from ECR)
- A security group allowing inbound HTTP (port 80)

<img src="screenshots/cloud-23.png" width="600" alt="Create Allow HTTP security group">

> **Gotcha:** the HTTP rule was first added to the security group's *outbound* rules instead of *inbound*. Since the default outbound rule already allows all traffic, this silently did nothing — the site was unreachable until an inbound rule for TCP 80 from `0.0.0.0/0` was added instead.

---

## 5. Amazon ECS — cluster, task definition, and service

**Cluster** (Fargate, serverless — no EC2 instances to manage):

<img src="screenshots/cloud-16.png" width="600" alt="Create ECS cluster"> <img src="screenshots/cloud-17.png" width="600" alt="Cluster created">

**Task definition** — describes the container: image, port, CPU/memory:

<img src="screenshots/cloud-18.png" width="500" alt="Create task definition"> <img src="screenshots/cloud-19.png" width="500" alt="Container config"> <img src="screenshots/cloud-20.png" width="500" alt="Task definition created">

**Service** — keeps the desired number of tasks running, attached to the subnets/security group from step 4, with a public IP enabled:

<img src="screenshots/cloud-21.png" width="500" alt="Cluster overview"> <img src="screenshots/cloud-22.png" width="500" alt="Create service select task def"> <img src="screenshots/cloud-24.png" width="500" alt="Service networking config">

First task running, reachable at its public IP:

<img src="screenshots/cloud-25.png" width="600" alt="Task network bindings">

> **Gotcha:** `CannotPullContainerError: image Manifest does not contain descriptor matching platform 'linux/amd64'` — this was the arm64/amd64 mismatch from step 2. Fixed by rebuilding with `--platform linux/amd64` and re-pushing. ECS's deployment circuit breaker had already logged a "Rollback failed" from the earlier failed attempts, but once the correct image was live, the service settled into a healthy `COMPLETED` rollout on its own.

<img src="screenshots/cloud-26.png" width="600" alt="Service rollback failed but task running">

---

## 6. `buildspec.yml` — telling CodeBuild what to do

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
  build:
    commands:
      - echo Building the Docker image...
      - docker build -t docker_checker .
      - echo Tagging the Docker image...
      - docker tag docker_checker:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/docker-project:latest
  post_build:
    commands:
      - echo Pushing the Docker image to Amazon ECR...
      - docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/docker-project:latest
      - echo Creating imagedefinitions.json file for ECS deployment...
      - echo '[{"name":"Main","imageUri":"<account-id>.dkr.ecr.us-east-1.amazonaws.com/docker-project:latest"}]' > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
```

`imagedefinitions.json` is the hand-off file CodePipeline's ECS deploy stage reads to know which new image to roll out — the container name inside it (`Main`) must match the container name in the ECS task definition exactly.

<img src="screenshots/cloud-27.png" width="500" alt="buildspec.yml reference"> <img src="screenshots/cloud-28.png" width="500" alt="git push commands">

---

## 7. IAM roles for CodeBuild

CodeBuild needs its own role to pull source, push images to ECR, write build artifacts to S3, and (later) update the ECS service. Attached AWS-managed policies plus one scoped custom policy:

<img src="screenshots/cloud-29.png" width="500" alt="IAM role trusted entity CodeBuild"> <img src="screenshots/cloud-30.png" width="500" alt="Managed policies attached">

A custom inline policy, **ECSAccessPolicy**, scoped to only the one ECS service this pipeline deploys to (least privilege, rather than blanket ECS access):

<img src="screenshots/cloud-31.png" width="500" alt="Policy JSON template"> <img src="screenshots/cloud-32.png" width="500" alt="Policy editor with real ARN"> <img src="screenshots/cloud-33.png" width="500" alt="ECSAccessPolicy review and create">

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ecs:UpdateService", "ecs:DescribeServices"],
      "Resource": "arn:aws:ecs:us-east-1:<account-id>:service/docker-project/docker-project-service-<id>"
    }
  ]
}
```

---

## 8. S3 bucket for build artifacts

CodeBuild needs somewhere to store its output artifact (`imagedefinitions.json`) between the build and deploy stages:

<img src="screenshots/cloud-34.png" width="600" alt="Create S3 bucket">

---

## 9. AWS CodeBuild — the build stage

Created a build project pointing at the GitHub repo, using the IAM role and buildspec from the steps above:

<img src="screenshots/cloud-35.png" width="500" alt="Create build project"> <img src="screenshots/cloud-36.png" width="500" alt="GitHub source connected"> <img src="screenshots/cloud-37.png" width="500" alt="Existing service role"> <img src="screenshots/cloud-38.png" width="500" alt="Use buildspec file"> <img src="screenshots/cloud-39.png" width="500" alt="S3 artifacts">

Ran it manually first to confirm the whole build → push → artifact flow worked before wiring up the pipeline:

<img src="screenshots/cloud-40.png" width="500" alt="Build started"> <img src="screenshots/cloud-41.png" width="500" alt="Build logs success"> <img src="screenshots/cloud-42.png" width="500" alt="imagedefinitions.json in S3">

---

## 10. AWS CodePipeline — wiring it all together

Three stages: **Source** (GitHub) → **Build** (the CodeBuild project above) → **Deploy** (ECS).

<img src="screenshots/cloud-43.png" width="500" alt="Choose build custom pipeline"> <img src="screenshots/cloud-44.png" width="500" alt="Pipeline settings"> <img src="screenshots/cloud-45.png" width="500" alt="Source stage GitHub">

<img src="screenshots/cloud-46.png" width="500" alt="Build stage CodeBuild"> <img src="screenshots/cloud-47.png" width="500" alt="Deploy stage ECS">

Pipeline created — all three stages green on the first automated run:

<img src="screenshots/cloud-48.png" width="700" alt="Pipeline Source Build Deploy all succeeded">

---

## 11. End-to-end verification

To prove the automation actually works (not just that the resources exist), edited the page title in `index.html` and pushed to GitHub — no manual AWS console steps:

```html
<h1>Checkers (deployed via CI/CD)</h1>
```

The GitHub webhook triggered CodePipeline automatically, which ran the build and redeployed ECS without any manual intervention. The live site reflected the change:

<img src="screenshots/cloud-50.png" width="600" alt="Live checkers game showing deployed via CI/CD title">

Confirmed via CLI that both the ECS deployment and the pipeline execution finished cleanly:

<img src="screenshots/cloud-51.png" width="700" alt="Terminal confirming ECS and CodePipeline success">

```
$ aws ecs describe-services ...
rolloutState: COMPLETED | status: PRIMARY | taskDef: docker-project:3

$ aws codepipeline get-pipeline-state ...
status: Succeeded | summary: Cluster: docker-project service: docker-project-service-... status: FINISHED
```

---

## Troubleshooting log

| Symptom | Cause | Fix |
|---|---|---|
| `CannotPullContainerError: ... platform 'linux/amd64'` | Image built as `arm64` on an Apple Silicon Mac; Fargate needs `amd64` | `docker build --platform linux/amd64 -t docker_checker .`, then re-tag/push |
| `docker tag` — `'docker tag' requires 2 arguments` | Stray space after the colon in the tag command | Remove the space: `docker tag image:latest target:latest` |
| Site unreachable at the task's public IP | HTTP rule was added to the security group's outbound rules instead of inbound | Add an inbound rule for TCP 80 from `0.0.0.0/0` |
| ECS service showed "Rollback failed" | Deployment circuit breaker tripped from the earlier failed image pulls, with no prior healthy revision to roll back to | Cosmetic once the correct image was pushed — the service settled into `COMPLETED` on its own |
| No subnets available when creating the ECS service | A custom VPC was created without any subnets | Created 2 public subnets (different AZs) + Internet Gateway + route table |

---

## Cost note

Every resource in this project (ECS/Fargate, ECR, CodeBuild, CodePipeline, VPC networking) was **torn down after verification** to avoid ongoing charges. Total AWS spend for building and testing this pipeline was well under $1.
