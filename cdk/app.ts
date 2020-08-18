import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as autoscaling from "@aws-cdk/aws-autoscaling";
import {
  SecurityGroup,
  CfnSecurityGroupIngress,
  Protocol,
} from "@aws-cdk/aws-ec2";
//import { InstanceType, InstanceSize, InstanceClass } from "@aws-cdk/aws-ec2";
//import { AddAutoScalingGroupCapacityOptions } from "@aws-cdk/aws-ecs";

class BaseVPCStack extends cdk.Stack {
  vpc: ec2.Vpc;
  ecsCluster: ecs.Cluster;
  asg: autoscaling.AutoScalingGroup;
  nameSpaceOutputs: any;
  clusterOutputs: any;
  services3000SecGroup: SecurityGroup;
  secGrpIngressSelf3000: CfnSecurityGroupIngress;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // This resource alone will create a private/public subnet in each AZ as well as nat/internet gateway(s)
    this.vpc = new ec2.Vpc(this, "BaseVPC", {
      cidr: "10.0.0.0/24",
    });

    // Creating ECS Cluster in the VPC created above
    this.ecsCluster = new ecs.Cluster(this, "ECSCluster", {
      vpc: this.vpc,
      clusterName: "container-demo",
    });

    // Adding service discovery namespace to cluster
    this.ecsCluster.addDefaultCloudMapNamespace({ name: "service" });

    /* CAPACITY SECTION
    # Adding EC2 capacity to the ECS Cluster
    this.asg = this.ecsCluster.addCapacity("ECSEC2Capacity", {
        instanceType: new ec2.InstanceType(`${InstanceClass.T3}-${InstanceSize.SMALL}`),
        minCapacity: 0,
        maxCapacity: 10
    })
    new cdk.CfnOutput(this, 'EC2AutoScalingGroupName', {value: this.asg.autoScalingGroupName, exportName: 'EC2ASGName'})
    */

    // Namespace details as CFN output
    this.nameSpaceOutputs = {
      ARN: this.ecsCluster.defaultCloudMapNamespace?.namespaceArn,
      NAME: this.ecsCluster.defaultCloudMapNamespace?.namespaceName,
      ID: this.ecsCluster.defaultCloudMapNamespace?.namespaceId,
    };

    // Cluster Attributes
    this.clusterOutputs = {
      NAME: this.ecsCluster.clusterName,
      SECGRPS: this.ecsCluster.connections.securityGroups.map((value) =>
        String(value)
      ),
    };

    // When enabling EC2, we need the security groups "registered" to the cluster for imports in other service stacks
    if (this.ecsCluster.connections.securityGroups) {
      this.clusterOutputs["SECGRPS"] = String(
        this.ecsCluster.connections.securityGroups.map(
          (value) => value.securityGroupId
        )[0]
      );
    }

    // Frontend service to backend services on 3000
    this.services3000SecGroup = new ec2.SecurityGroup(
      this,
      "FrontendToBackendSecurityGroup",
      {
        allowAllOutbound: true,
        description:
          "Security group for frontend service to talk to backend services",
        vpc: this.vpc,
      }
    );

    // Allow inbound 3000 from ALB to Frontend Service
    this.secGrpIngressSelf3000 = new ec2.CfnSecurityGroupIngress(
      this,
      "InboundSecGrp3000",
      {
        ipProtocol: Protocol.TCP,
        sourceSecurityGroupId: this.services3000SecGroup.securityGroupId,
        fromPort: 3000,
        toPort: 3000,
        groupId: this.services3000SecGroup.securityGroupId,
      }
    );

    // All outputs required for other stacks to build
    new cdk.CfnOutput(this, "NSArn", {
      value: this.nameSpaceOutputs["ARN"],
      exportName: "NSARN",
    });
    new cdk.CfnOutput(this, "NSName", {
      value: this.nameSpaceOutputs["NAME"],
      exportName: "NSNAME",
    });
    new cdk.CfnOutput(this, "NSId", {
      value: this.nameSpaceOutputs["ID"],
      exportName: "NSID",
    });
    new cdk.CfnOutput(this, "FE2BESecGrp", {
      value: this.services3000SecGroup.securityGroupId,
      exportName: "SecGrpId",
    });
    new cdk.CfnOutput(this, "ECSClusterName", {
      value: this.clusterOutputs["NAME"],
      exportName: "ECSClusterName",
    });
    new cdk.CfnOutput(this, "ECSClusterSecGrp", {
      value: this.clusterOutputs["SECGRPS"],
      exportName: "ECSSecGrpList",
    });
    new cdk.CfnOutput(this, "ServicesSecGrp", {
      value: this.services3000SecGroup.securityGroupId,
      exportName: "ServicesSecGrp",
    });
  }
}

const env: cdk.Environment = {
  account: process.env.AWS_ACCOUNT_ID,
  region: process.env.AWS_DEFAULT_REGION,
};

const stack_name = "ecsworkshop-base";
const app = new cdk.App();
new BaseVPCStack(app, stack_name, { env });
app.synth();
