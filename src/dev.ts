import { Wavoip } from "@/index";

const wavoip = new Wavoip({ tokens: [] });

console.log(wavoip.addDevices(["05d55e3a-ec74-4e13-94b9-3e6352328f03", "da441dcd-5fca-4afd-9569-3a98f034846c"]));
