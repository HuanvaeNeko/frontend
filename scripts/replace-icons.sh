#!/bin/bash

# 批量替换所有页面中的图标

files=(
  "src/pages/Profile.tsx"
  "src/pages/AiChat.tsx"
  "src/pages/GroupChat.tsx"
  "src/pages/VideoMeeting.tsx"
  "src/pages/Settings.tsx"
  "src/pages/Devices.tsx"
)

for file in "${files[@]}"; do
  echo "Processing $file..."
  
  # Profile.tsx 图标映射
  if [[ $file == *"Profile.tsx"* ]]; then
    sed -i '' "s|from '@fortawesome/react-fontawesome'||g" "$file"
    sed -i '' "s|from '@fortawesome/free-solid-svg-icons'||g" "$file"
    sed -i '' "s|{ FontAwesomeIcon } ||g" "$file"
    sed -i '' "s|FontAwesomeIcon icon={faArrowLeft}|ArrowLeft size={18}|g" "$file"
    sed -i '' "s|FontAwesomeIcon icon={faUser}|User size={20}|g" "$file"
    sed -i '' "s|FontAwesomeIcon icon={faEdit}|Edit size={18}|g" "$file"
    sed -i '' "s|FontAwesomeIcon icon={faSave}|Save size={18}|g" "$file"
    sed -i '' "s|FontAwesomeIcon icon={faTimes}|X size={18}|g" "$file"
    sed -i '' "s|FontAwesomeIcon icon={faCamera}|Camera size={16}|g" "$file"
    sed -i '' "s|FontAwesomeIcon icon={faKey}|Key size={16}|g" "$file"
    sed -i '' "s|FontAwesomeIcon icon={faTrash}|Trash2 size={16}|g" "$file"
    sed -i '' "s|FontAwesomeIcon icon={faChartBar}|BarChart size={20}|g" "$file"
  fi
  
done

echo "Done!"

