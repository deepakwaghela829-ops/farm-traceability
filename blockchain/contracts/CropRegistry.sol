// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CropRegistry {
    struct Crop {
        uint256 cropId;
        address farmer;
        string cropName;
        string cropType;
        uint256 quantity;
        string unit;
        uint256 cultivationDate;
        uint256 expectedHarvestDate;
        string location;
        uint256 createdAt;
    }

    struct Movement {
        address from;
        address to;
        string toRole;
        uint256 timestamp;
    }

    uint256 private nextCropId = 1;

    mapping(uint256 => Crop) private crops;
    mapping(address => uint256[]) private farmerCrops;

    mapping(uint256 => bool) public harvested;
    mapping(uint256 => uint256) public harvestTimestamp;

    mapping(uint256 => address) public currentHolder;
    mapping(uint256 => Movement[]) private movementHistory;

    event CropRegistered(
        uint256 indexed cropId,
        address indexed farmer,
        string cropName,
        uint256 quantity,
        string unit
    );

    event CropHarvested(
        uint256 indexed cropId,
        address indexed farmer,
        uint256 timestamp
    );

    event ProductMoved(
        uint256 indexed cropId,
        address indexed from,
        address indexed to,
        string toRole,
        uint256 timestamp
    );

    function registerCrop(
        string calldata cropName,
        string calldata cropType,
        uint256 quantity,
        string calldata unit,
        uint256 cultivationDate,
        uint256 expectedHarvestDate,
        string calldata location
    ) external returns (uint256) {
        require(bytes(cropName).length > 0, "Crop name required");
        require(bytes(cropType).length > 0, "Crop type required");
        require(quantity > 0, "Quantity must be positive");
        require(
            expectedHarvestDate >= cultivationDate,
            "Invalid harvest date"
        );

        uint256 cropId = nextCropId;

        crops[cropId] = Crop({
            cropId: cropId,
            farmer: msg.sender,
            cropName: cropName,
            cropType: cropType,
            quantity: quantity,
            unit: unit,
            cultivationDate: cultivationDate,
            expectedHarvestDate: expectedHarvestDate,
            location: location,
            createdAt: block.timestamp
        });

        farmerCrops[msg.sender].push(cropId);
        currentHolder[cropId] = msg.sender;
        nextCropId++;

        emit CropRegistered(
            cropId,
            msg.sender,
            cropName,
            quantity,
            unit
        );

        return cropId;
    }

    function markHarvested(uint256 cropId) external {
        require(crops[cropId].cropId != 0, "Crop not found");
        require(
            msg.sender == crops[cropId].farmer,
            "Only farmer can mark harvest"
        );
        require(!harvested[cropId], "Crop already harvested");

        harvested[cropId] = true;
        harvestTimestamp[cropId] = block.timestamp;

        emit CropHarvested(
            cropId,
            msg.sender,
            block.timestamp
        );
    }

    function transferCrop(
        uint256 cropId,
        address to,
        string calldata toRole
    ) external {
        require(crops[cropId].cropId != 0, "Crop not found");
        require(to != address(0), "Invalid recipient");
        require(bytes(toRole).length > 0, "Role required");
        require(
            msg.sender == currentHolder[cropId],
            "Only current holder can transfer"
        );

        address from = currentHolder[cropId];
        currentHolder[cropId] = to;

        movementHistory[cropId].push(
            Movement({
                from: from,
                to: to,
                toRole: toRole,
                timestamp: block.timestamp
            })
        );

        emit ProductMoved(
            cropId,
            from,
            to,
            toRole,
            block.timestamp
        );
    }

    function getCrop(
        uint256 cropId
    ) external view returns (Crop memory) {
        require(crops[cropId].cropId != 0, "Crop not found");
        return crops[cropId];
    }

    function getFarmerCrops(
        address farmer
    ) external view returns (uint256[] memory) {
        return farmerCrops[farmer];
    }

    function getMovementHistory(
        uint256 cropId
    ) external view returns (Movement[] memory) {
        require(crops[cropId].cropId != 0, "Crop not found");
        return movementHistory[cropId];
    }

    function getCurrentHolder(
        uint256 cropId
    ) external view returns (address) {
        require(crops[cropId].cropId != 0, "Crop not found");
        return currentHolder[cropId];
    }
}
