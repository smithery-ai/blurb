const adjectives = [
  "bold","bright","calm","clean","cold","cool","crisp","dark","deep","dry",
  "fair","fast","fine","firm","flat","fond","free","full","glad","gold",
  "good","gray","keen","kind","last","lean","left","long","loud","mild",
  "neat","nice","pale","pure","rare","raw","rich","ripe","safe","sharp",
  "slim","slow","soft","sour","sure","tall","thin","true","vast","warm",
]

const verbs = [
  "biting","blazing","breaking","calling","carving","casting","chasing",
  "climbing","crafting","crossing","dancing","dashing","diving","drafting",
  "drawing","drifting","falling","fishing","flying","forging","gliding",
  "growing","hiding","hiking","hunting","jumping","landing","leading",
  "leaping","lifting","making","moving","naming","pacing","passing",
  "pulling","racing","reading","riding","rising","rowing","running",
  "sailing","seeking","singing","sitting","sleeping","sliding","soaring",
  "spinning",
]

const animals = [
  "ant","bat","bear","bee","bird","boar","bull","cat","cod","cow",
  "crab","crow","deer","dog","dove","duck","eagle","eel","elk","emu",
  "fish","frog","goat","gull","hare","hawk","hen","hog","ibis","jay",
  "koi","lark","lion","lynx","mole","moth","mule","newt","osprey","otter",
  "owl","ox","puma","quail","ram","ray","seal","slug","swan","wolf",
]

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

export async function anonName(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip)
  const hash = await crypto.subtle.digest("SHA-256", data)
  const bytes = new Uint8Array(hash)
  const adj = adjectives[bytes[0] % adjectives.length]
  const animal = animals[bytes[1] % animals.length]
  return `${adj[0].toUpperCase()}${adj.slice(1)} ${animal[0].toUpperCase()}${animal.slice(1)}`
}

export function generateSlug(): string {
  return `${pick(adjectives)}-${pick(verbs)}-${pick(animals)}`
}

export async function uniqueSlug(db: D1Database): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const slug = generateSlug()
    const existing = await db.prepare("SELECT 1 FROM tasks WHERE slug = ?").bind(slug).first()
    if (!existing) return slug
  }
  // Fallback: append random digits
  return `${generateSlug()}-${Math.floor(Math.random() * 900 + 100)}`
}
