export const draftCategories = [
  "Important",
  "Freezer",
  "Sauces",
  "Fridge",
  "Tiramisu",
  "Juices",
  "Toppings",
  "Shelf",
  "Packaging",
  "Cleaning",
  "Milk",
]

export const draftRoles = ["Owner", "Manager", "Front and Back House Team Member"]

export const draftManager = {
  id: 1,
  name: "Draft Manager",
  role: "Owner",
  avatar: "DM",
  clockedIn: false,
  clockIn: null,
  signedOff: false,
  isManager: true,
}

export const draftTeam = [
  draftManager,
  { id: 2, name: "Sample Staff", role: "Front and Back House Team Member", avatar: "SS", clockedIn: true, clockIn: "10:00 am", signedOff: false, isManager: false },
]

export const draftItems = [
  { id: 1, name: "Fresh Strawberries", category: "Fridge", unit: "kg", par: 40, qty: 6 },
  { id: 2, name: "Fresh Bananas", category: "Fridge", unit: "pcs", par: 12, qty: 6 },
  { id: 3, name: "Fresh Dragonfruit", category: "Fridge", unit: "pcs", par: 2, qty: 3 },
  { id: 4, name: "Fresh Raspberries", category: "Fridge", unit: "Punnets", par: 4, qty: 0 },
  { id: 5, name: "Cocobella Coconut Yogurt", category: "Fridge", unit: "Units", par: 2, qty: 0 },
  { id: 6, name: "Frozen Mango", category: "Freezer", unit: "kg", par: 4, qty: 7.5 },
  { id: 7, name: "Cookie/Pancake Boxes", category: "Packaging", unit: "Sleeves", par: 50, qty: 92 },
  { id: 8, name: "Nutella", category: "Sauces", unit: "Units", par: 4, qty: 0.5 },
]

export const draftChecklistItems = [
  { id: 1, type: "opening", label: "Turn on all sauce-warmer switches", position: 0, archived: false },
  { id: 2, type: "opening", label: "Turn on all lights and activate the music system", position: 1, archived: false },
  { id: 3, type: "opening", label: "Put the acai machine into wash mode, wait 5 minutes, then return it to production mode", position: 2, archived: false },
  { id: 4, type: "opening", label: "Check the acai bucket temperature is 9°C to 10°C", position: 3, archived: false },
  { id: 5, type: "closing", label: "Clean and sanitise all benches", position: 0, archived: false },
  { id: 6, type: "closing", label: "Complete the closing stock check", position: 1, archived: false },
]
