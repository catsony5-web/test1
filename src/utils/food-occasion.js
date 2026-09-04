const FOOD_OCCASIONS = [
  { key: "family", label: "가족 외식" },
  { key: "date", label: "데이트" },
  { key: "celebration", label: "축하·기념" },
  { key: "treat", label: "내가 한턱" }
];

function normalizeFoodOccasion(value) {
  return FOOD_OCCASIONS.some((occasion) => occasion.key === value) ? value : "";
}

function foodOccasionFor(item) {
  return item?.sector === "식비" && item.flow !== "income"
    ? normalizeFoodOccasion(item.foodOccasion) : "";
}
