from flask import Flask, render_template, request, send_file
import xml.etree.ElementTree as ET
import os
import base64
from io import BytesIO

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/import_sbc', methods=['POST'])
def import_sbc():
    if 'file' not in request.files:
        return {'error': 'No file part'}, 400
    file = request.files['file']
    if file.filename == '':
        return {'error': 'No selected file'}, 400
    
    try:
        tree = ET.parse(file)
        root = tree.getroot()
        
        # Namespace handling for XML parsing
        namespaces = {'xsd': 'http://www.w3.org/2001/XMLSchema', 
                      'xsi': 'http://www.w3.org/2001/XMLSchema-instance'}

        cube_blocks = []
        for cube_grid in root.findall('.//CubeGrid'):
            for block in cube_grid.findall('CubeBlocks/MyObjectBuilder_CubeBlock', namespaces):
                subtype = block.find('SubtypeName', namespaces).text if block.find('SubtypeName', namespaces) is not None else 'Unknown'
                min_coords_elem = block.find('Min', namespaces)
                min_x = int(min_coords_elem.get('x')) if min_coords_elem is not None else 0
                min_y = int(min_coords_elem.get('y')) if min_coords_elem is not None else 0
                min_z = int(min_coords_elem.get('z')) if min_coords_elem is not None else 0
                
                block_orientation_elem = block.find('BlockOrientation', namespaces)
                forward = block_orientation_elem.get('Forward') if block_orientation_elem is not None else 'Forward'
                up = block_orientation_elem.get('Up') if block_orientation_elem is not None else 'Up'

                color_mask_hsv_elem = block.find('ColorMaskHSV', namespaces)
                color_x = float(color_mask_hsv_elem.get('x')) if color_mask_hsv_elem is not None else 0.0
                color_y = float(color_mask_hsv_elem.get('y')) if color_mask_hsv_elem is not None else 0.0
                color_z = float(color_mask_hsv_elem.get('z')) if color_mask_hsv_elem is not None else 0.0

                cube_blocks.append({
                    'SubtypeName': subtype,
                    'Min': {'x': min_x, 'y': min_y, 'z': min_z},
                    'BlockOrientation': {'Forward': forward, 'Up': up},
                    'ColorMaskHSV': {'x': color_x, 'y': color_y, 'z': color_z}
                })
        return {'blocks': cube_blocks}
    except Exception as e:
        return {'error': f'Error parsing SBC file: {e}'}, 500

@app.route('/export_sbc', methods=['POST'])
def export_sbc():
    data = request.get_json()
    blocks = data.get('blocks', [])
    blueprint_name = data.get('filename', 'exported_ship')
    thumbnail_data = data.get('thumbnail', None)

    # Ensure the blueprint_name does not contain .sbc extension for folder naming
    if blueprint_name.lower().endswith('.sbc'):
        blueprint_name = blueprint_name[:-4] # Remove .sbc
    
    # Define the base directory for blueprints
    blueprints_dir = os.path.join(app.root_path, 'blueprints')
    os.makedirs(blueprints_dir, exist_ok=True) # Ensure blueprints directory exists

    # Create a unique folder for the blueprint
    blueprint_folder = os.path.join(blueprints_dir, blueprint_name)
    os.makedirs(blueprint_folder, exist_ok=True)

    # Path for the .sbc file inside the new folder
    sbc_filepath = os.path.join(blueprint_folder, 'bp.sbc')

    # Create a dummy XML structure for the blueprint
    # This is a simplified structure based on what was observed in bp.sbc
    root = ET.Element('ShipBlueprint', attrib={'xmlns:xsd': 'http://www.w3.org/2001/XMLSchema', 
                                               'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'})
    
    # Add Id element with a Guid and DisplayName
    id_element = ET.SubElement(root, 'Id')
    ET.SubElement(id_element, 'TypeId').text = 'BlueprintDefinition'
    # Generate a consistent GUID based on blueprint_name for determinism, or use uuid.uuid4() for unique
    import hashlib
    guid_str = hashlib.md5(blueprint_name.encode()).hexdigest()
    ET.SubElement(id_element, 'SubtypeId').text = f'{{guid_str[0:8]}}-{{guid_str[8:12]}}-{{guid_str[12:16]}}-{{guid_str[16:20]}}-{{guid_str[20:32]}}'

    display_name = ET.SubElement(root, 'DisplayName')
    display_name.text = blueprint_name

    cube_grids = ET.SubElement(root, 'CubeGrids')
    cube_grid = ET.SubElement(cube_grids, 'CubeGrid')

    # Add a <GridSizeEnum> element as observed in bp.sbc (assuming Large for now)
    ET.SubElement(cube_grid, 'GridSizeEnum').text = 'Large'
    
    # Placeholder for general block properties if needed later
    # ET.SubElement(cube_grid, 'Immune').text = 'false'

    blocks_element = ET.SubElement(cube_grid, 'CubeBlocks')

    for block_data in blocks:
        block = ET.SubElement(blocks_element, 'MyObjectBuilder_CubeBlock', attrib={'xsi:type': 'MyObjectBuilder_CubeBlock'})
        
        # Add block specific properties from frontend data
        subtype_name = ET.SubElement(block, 'SubtypeName')
        subtype_name.text = block_data.get('SubtypeName', 'LargeBlockArmorBlock') # Default

        min_coords = ET.SubElement(block, 'Min')
        ET.SubElement(min_coords, 'x').text = str(block_data['Min']['x'])
        ET.SubElement(min_coords, 'y').text = str(block_data['Min']['y'])
        ET.SubElement(min_coords, 'z').text = str(block_data['Min']['z'])

        block_orientation = ET.SubElement(block, 'BlockOrientation')
        ET.SubElement(block_orientation, 'Forward').text = block_data['BlockOrientation']['Forward']
        ET.SubElement(block_orientation, 'Up').text = block_data['BlockOrientation']['Up']

        color_mask = ET.SubElement(block, 'ColorMaskHSV')
        ET.SubElement(color_mask, 'x').text = str(block_data['ColorMaskHSV']['x'])
        ET.SubElement(color_mask, 'y').text = str(block_data['ColorMaskHSV']['y'])
        ET.SubElement(color_mask, 'z').text = str(block_data['ColorMaskHSV']['z'])

    # Add a dummy MyObjectBuilder_FactionTag if it exists (not strictly necessary but common)
    # ET.SubElement(root, 'MyObjectBuilder_FactionTag')

    xml_string = ET.tostring(root, encoding='utf-8', method='xml').decode('utf-8')
    # Add the XML declaration and pretty print (manual indentation for simplicity)
    pretty_xml = '<?xml version="1.0"?>\n' + xml_string.replace('><', '>\n<') # Basic formatting

    # Save the .sbc file
    with open(sbc_filepath, 'w', encoding='utf-8') as f:
        f.write(pretty_xml)

    # Save the thumbnail image if provided
    if thumbnail_data:
        try:
            # Extract base64 part (remove 'data:image/png;base64,')
            header, encoded_data = thumbnail_data.split(',', 1)
            binary_data = base64.b64decode(encoded_data)

            thumbnail_filepath = os.path.join(blueprint_folder, 'thumb.png')
            with open(thumbnail_filepath, 'wb') as f:
                f.write(binary_data)
        except Exception as e:
            print(f"Error saving thumbnail: {e}")
            return {'error': f'Failed to save thumbnail: {e}'}, 500

    return {'message': f'Blueprint \'{blueprint_name}\' exported successfully to blueprints/{blueprint_name}/'}

if __name__ == '__main__':
    # Ensure 'templates', 'static', and 'blueprints' directories exist
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static', exist_ok=True)
    os.makedirs('blueprints', exist_ok=True)
    app.run(debug=True) 